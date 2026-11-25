"""Manage datasets, training jobs and model artifacts without a ROS dependency."""

from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Lock, Thread
from uuid import uuid4

import joblib
import numpy as np
import sklearn

from inputs import lidar_features, portable_model, train_models
from navigation_history import write_atomically
from scenarios import ROOT, SCENARIOS, package_id


MODEL_LABELS = {
    'knn': 'KNN', 'naive_bayes': 'Gaussian Naive Bayes', 'decision_tree': 'Decision Tree',
    'random_forest': 'Random Forest', 'baseline': 'Majority baseline',
}
MAX_CSV_BYTES = 4 * 1024 * 1024
RUN_ID = re.compile(r'\d{8}_\d{6}_[a-f0-9]{6}')
SESSION_ID = re.compile(r'\d{8}T\d{12}Z')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def preview_dataset(data, world=None, test_data=None):
    try:
        fields, rows = train_models.read_csv(data)
    except (UnicodeError, csv.Error) as error:
        raise ValueError('Choose a valid UTF-8 CSV file.') from error
    features = train_models.NAVIGATION_FEATURES
    actions = train_models.NAVIGATION_ACTIONS
    preview_fields = ['scan_time', *features, 'action']
    counts = Counter(row.get('action') for row in rows)
    strategy = train_models.split_strategy(fields)
    run_count = len({row['run_id'] for row in rows if row['run_id']}) if strategy == 'by_run' else None
    summary = dict(total=len(rows), fields=preview_fields, capture_timing=train_models.capture_timing(rows),
                   split_strategy=strategy, navigation_run_count=run_count,
                   rows=[[row.get(name) for name in preview_fields] for row in rows[:6]],
                   counts={label: counts[label] for label in actions})
    try:
        if test_data is not None:
            test_fields, test_rows = train_models.read_csv(test_data)
            train_models.validate_session(fields, rows)
            train_models.validate_session(test_fields, test_rows)
            return dict(summary, total=len(rows) + len(test_rows), train=len(rows), test=len(test_rows),
                        split_strategy='by_session', excluded_gap=0, error=None)
        _, _, _, train, test, _ = train_models.prepare_dataset(fields, rows)
        if world and rows[0]['world'] != world:
            raise ValueError('This CSV belongs to a different map. Select its map before training.')
    except ValueError as error:
        return dict(summary, error=str(error))
    return dict(summary, train=int(train.sum()), test=int(test.sum()),
                excluded_gap=int((~(train | test)).sum()), error=None)


class Workspace:
    def __init__(self, reference, runs_dir):
        self.reference = reference
        self.runs_dir = runs_dir
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.lock = Lock()
        self.job = None

    def session_csv_path(self, session_id):
        if not isinstance(session_id, str) or not SESSION_ID.fullmatch(session_id):
            raise ValueError('Invalid driving session ID.')
        return self.runs_dir / 'sessions' / f'{session_id}.csv'

    def save_session(self, session_id, data):
        write_atomically(self.session_csv_path(session_id), data)

    def sessions(self, world):
        return [path.stem for path in sorted((self.runs_dir / 'sessions').glob('*.csv'), reverse=True)
                if SESSION_ID.fullmatch(path.stem) and self.csv_world(path) == world]

    def dataset(self, request, manual_csv, scenario):
        source = request.get('source')
        if source == 'packaged':
            data = (self.directory(package_id(scenario)) / 'dataset.csv').read_bytes()
            name = f"{SCENARIOS[scenario]['label']} · Packaged driving data"
        elif source == 'manual':
            data, name = manual_csv(), 'Gazebo · Manual driving session'
        elif source == 'archive':
            path = self.session_csv_path(request.get('session_id'))
            if not path.is_file():
                raise FileNotFoundError('Driving session not found.')
            data, name = path.read_bytes(), f'Gazebo · Saved driving session {path.stem}'
        elif source == 'upload':
            content, name = request.get('csv'), request.get('name')
            if not isinstance(content, str) or not isinstance(name, str) or not name.lower().endswith('.csv'):
                raise ValueError('Choose a CSV file.')
            try:
                data = content.encode('utf-8')
            except UnicodeError as error:
                raise ValueError('Choose a valid UTF-8 CSV file.') from error
            name = name.replace('\\', '/').rsplit('/', 1)[-1][:160]
        else:
            raise ValueError('Choose a dataset source.')
        if len(data) > MAX_CSV_BYTES:
            raise ValueError('CSV exceeds the 4 MiB limit.')
        return data, dict(source=source, name=name, world=SCENARIOS[scenario]['world'])

    def directory(self, run_id):
        for scenario in SCENARIOS:
            if run_id == package_id(scenario):
                directory = self.reference / scenario
                if not (directory / 'results' / 'manifest.json').is_file():
                    raise FileNotFoundError('This map does not have packaged driving data yet.')
                return directory
        if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id):
            raise ValueError('Invalid training run ID.')
        directory = self.runs_dir / run_id
        if not (directory / 'run.json').is_file():
            raise FileNotFoundError('Training run not found.')
        return directory

    @staticmethod
    def csv_world(path):
        try:
            with path.open(encoding='utf-8-sig', newline='') as source:
                row = next(csv.DictReader(source), {})
                if all(key in row for key in train_models.NAVIGATION_FEATURES):
                    return row.get('world')
        except (FileNotFoundError, UnicodeError, csv.Error):
            pass
        return None

    def run_manifest(self, directory):
        manifest = read_json(directory / 'results' / 'manifest.json')
        if manifest.get('features') != train_models.NAVIGATION_FEATURES:
            raise FileNotFoundError('Training run uses a legacy feature set.')
        world = manifest.get('world') or self.csv_world(directory / 'dataset.csv')
        if not any(world == scenario['world'] for scenario in SCENARIOS.values()):
            raise FileNotFoundError('Training run has no compatible map.')
        manifest['world'] = world
        return manifest

    def state(self, scenario):
        world = SCENARIOS[scenario]['world']
        with self.lock:
            job = self.job.copy() if self.job and self.job['world'] == world else None
        runs = []
        for path in sorted(self.runs_dir.glob('*/run.json'), reverse=True):
            if not RUN_ID.fullmatch(path.parent.name):
                continue
            try:
                if self.run_manifest(path.parent)['world'] == world:
                    runs.append(read_json(path))
            except FileNotFoundError:
                continue
        if (self.reference / scenario / 'results' / 'manifest.json').is_file():
            runs.append(dict(id=package_id(scenario), dataset=f"{SCENARIOS[scenario]['label']} · Packaged driving data",
                             packaged=True))
        return dict(runs=runs, job=job)

    def packaged_report(self, scenario):
        try:
            return self.report(package_id(scenario))
        except FileNotFoundError:
            return None

    def packaged_test_data(self, scenario):
        path = self.directory(package_id(scenario)) / 'test_dataset.csv'
        return path.read_bytes() if path.is_file() else None

    def start(self, data, dataset, test_data=None):
        with self.lock:
            if self.job and self.job['status'] == 'running':
                raise RuntimeError('A training run is already in progress.')
            now = datetime.now(timezone.utc)
            run_id = now.strftime('%Y%m%d_%H%M%S_') + uuid4().hex[:6]
            run = dict(id=run_id, dataset=dataset['name'], source=dataset['source'],
                       world=dataset['world'], started_at=now.isoformat())
            self.job = dict(run, status='running')
            Thread(target=self.train, args=(run, data, test_data), daemon=True).start()
            return self.job.copy()

    def train(self, run, data, test_data):
        try:
            with TemporaryDirectory(prefix='.training-', dir=self.runs_dir) as temporary:
                output = Path(temporary) / 'run'
                output.mkdir()
                dataset = output / 'dataset.csv'
                dataset.write_bytes(data)
                command = [sys.executable, str(ROOT / 'inputs' / 'train_models.py'), '--data', str(dataset),
                           '--output', str(output)]
                if test_data is not None:
                    test_path = output / 'test_dataset.csv'
                    test_path.write_bytes(test_data)
                    command.extend(('--test-data', str(test_path)))
                completed = subprocess.run(
                    command, capture_output=True, text=True, encoding='utf-8',
                    timeout=120, env=dict(os.environ, OPENBLAS_NUM_THREADS='1', OMP_NUM_THREADS='1',
                                          PYTHONIOENCODING='utf-8'),
                )
                if completed.returncode != 0:
                    message = next((line.split(': error: ', 1)[1] for line in completed.stderr.splitlines()
                                    if line.startswith('train_models.py: error: ')), None)
                    if message is None:
                        logging.error('Training run %s failed: %s', run['id'], completed.stderr)
                    raise ValueError(message or 'Training failed. Check the server log.')
                (output / 'run.json').write_text(json.dumps(run, ensure_ascii=False), encoding='utf-8')
                output.rename(self.runs_dir / run['id'])
            job = dict(run, status='completed')
        except ValueError as error:
            job = dict(run, status='failed', error=str(error))
        except subprocess.TimeoutExpired:
            job = dict(run, status='failed', error='Training took longer than two minutes.')
        except Exception:
            logging.exception('Training run %s failed', run['id'])
            job = dict(run, status='failed', error='Training failed. Check the server log.')
        with self.lock:
            self.job = job

    def report(self, run_id):
        directory = self.directory(run_id)
        results = directory / 'results'
        manifest = self.run_manifest(directory)
        features = manifest['features']
        if manifest.get('imported'):
            artifact = directory / 'models' / 'decision_tree.json'
            return dict(id=run_id, world=manifest['world'], features=features, imported=True,
                        models=[dict(id='decision_tree', label=MODEL_LABELS['decision_tree'], deployable=True,
                                     artifact=artifact.name, artifact_bytes=artifact.stat().st_size)])
        classifications = read_json(results / 'classification_reports.json')
        with (results / 'metrics.csv').open(newline='', encoding='utf-8') as source:
            metrics = list(csv.DictReader(source))
        models = []
        for row in metrics:
            model = row['model']
            artifact = directory / 'models' / f'{model}.joblib'
            with (results / f'{model}_confusion.csv').open(newline='', encoding='utf-8') as source:
                header, *matrix = csv.reader(source)
            classes = header[1:]
            scores = classifications[model]
            models.append(dict(id=model, label=MODEL_LABELS[model], labels=classes,
                               deployable=model != 'baseline',
                               artifact=artifact.name if artifact.is_file() else None,
                               artifact_bytes=artifact.stat().st_size if artifact.is_file() else None,
                               fit_seconds=manifest.get('fit_seconds', {}).get(model),
                               params=manifest.get('model_params', {}).get(model, {}),
                               confusion=[[int(value) for value in line[1:]] for line in matrix],
                               accuracy=float(row['accuracy']), balanced_accuracy=float(row['balanced_accuracy']),
                               macro_f1=float(row['macro_f1']), precision=scores['macro avg']['precision'],
                               recall=scores['macro avg']['recall'], per_class={c: scores[c] for c in classes}))
        timing = manifest.get('capture_timing', 'unknown')
        return dict(id=run_id, total=manifest['total'], train=manifest['train'], test=manifest['test'],
                    trained_at=manifest.get('trained_at'), dataset_revision=manifest.get('sha256'),
                    excluded_gap=manifest['excluded_gap'], features=features, capture_timing=timing,
                    world=manifest['world'],
                    split_strategy=manifest.get('split_strategy', 'temporal_holdout'),
                    session_id=manifest['session_id'], test_session_id=manifest.get('test_session_id'),
                    class_counts=manifest['split_class_counts'], models=models)

    def mistakes(self, run_id, model, actual, predicted):
        directory = self.directory(run_id)
        manifest = self.run_manifest(directory)
        features = manifest['features']
        actions = train_models.NAVIGATION_ACTIONS
        if model not in MODEL_LABELS or actual == predicted or any(
                label not in actions for label in (actual, predicted)):
            raise ValueError('Choose a model and an off-diagonal confusion cell.')
        csv_name = 'test_dataset.csv' if manifest.get('test_session_id') else 'dataset.csv'
        _, rows = train_models.read_csv((directory / csv_name).read_bytes())
        with (directory / 'results' / 'test_predictions.csv').open(newline='', encoding='utf-8') as source:
            reader = csv.DictReader(source)
            if model not in (reader.fieldnames or []):
                raise ValueError('Model is not part of this run.')
            matches = [int(row['source_csv_row']) for row in reader
                       if row['true_action'] == actual and row[model] == predicted]
        examples = [dict(row=index, scan_time=rows[index - 2]['scan_time'],
                         features=[float(rows[index - 2][name]) for name in features])
                    for index in matches[:50]]
        return dict(total=len(matches), rows=examples, features=features)

    def import_tree(self, content, name, scenario):
        if not isinstance(name, str) or not name.lower().endswith('.json'):
            raise ValueError('Choose an exported Decision Tree JSON bundle.')
        world = SCENARIOS[scenario]['world']
        tree = portable_model.decode(content, world)
        try:
            data = content.encode('utf-8')
        except UnicodeError as error:
            raise ValueError('Choose a UTF-8 Decision Tree JSON bundle.') from error
        if len(data) > portable_model.MAX_MODEL_BYTES:
            raise ValueError('Choose a Decision Tree JSON bundle under 256 KiB.')
        now = datetime.now(timezone.utc)
        run_id = now.strftime('%Y%m%d_%H%M%S_') + uuid4().hex[:6]
        dataset = name.replace('\\', '/').rsplit('/', 1)[-1][:160]
        run = dict(id=run_id, dataset=dataset, source='model_import', imported=True,
                   world=world, started_at=now.isoformat())
        with TemporaryDirectory(prefix='.model-', dir=self.runs_dir) as temporary:
            output = Path(temporary) / 'run'
            (output / 'models').mkdir(parents=True)
            (output / 'results').mkdir()
            (output / 'models' / 'decision_tree.json').write_bytes(data)
            manifest = dict(world=world, features=train_models.NAVIGATION_FEATURES,
                            labels=tree.classes_.tolist(), imported=True, sha256=hashlib.sha256(data).hexdigest())
            (output / 'results' / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            (output / 'run.json').write_text(json.dumps(run, ensure_ascii=False), encoding='utf-8')
            output.rename(self.runs_dir / run_id)
        return run

    def export_tree(self, run_id):
        directory = self.directory(run_id)
        manifest = self.run_manifest(directory)
        if manifest.get('imported'):
            return (directory / 'models' / 'decision_tree.json').read_bytes()
        return portable_model.encode(self.load_model(run_id, 'decision_tree'))

    def load_model(self, run_id, model):
        if not isinstance(model, str) or model not in MODEL_LABELS or model == 'baseline':
            raise ValueError('Choose a trained model.')
        directory = self.directory(run_id)
        manifest = self.run_manifest(directory)
        if manifest.get('imported'):
            if model != 'decision_tree':
                raise ValueError('This imported run contains a Decision Tree only.')
            tree = portable_model.decode((directory / 'models' / 'decision_tree.json').read_text(encoding='utf-8'),
                                         manifest['world'])
            return dict(model=tree, world=manifest['world'], dataset_sha256=manifest['sha256'],
                        feature_medians=tree.feature_medians)
        path = directory / 'models' / f'{model}.joblib'
        if not path.is_file():
            raise FileNotFoundError('Model not found in this run.')
        if manifest['sklearn_version'] != sklearn.__version__:
            raise ValueError('Retrain the model in this app to match its scikit-learn version.')
        bundle = joblib.load(path)
        if (bundle['feature_names'] != train_models.NAVIGATION_FEATURES
                or bundle['actions'] != train_models.NAVIGATION_ACTIONS
                or bundle.get('world', manifest['world']) != manifest['world']
                or tuple(bundle['sector_centers_deg']) != tuple(lidar_features.SECTOR_CENTERS_DEG)
                or bundle['half_width_deg'] != lidar_features.HALF_WIDTH_DEG):
            raise ValueError('The model does not match the robot feature and action schema.')
        bundle['world'] = manifest['world']
        bundle['dataset_sha256'] = manifest.get('sha256')
        medians = manifest.get('feature_medians')
        if medians is None:
            fields, rows = train_models.read_csv((directory / 'dataset.csv').read_bytes())
            if manifest.get('test_session_id'):
                train, _, _ = train_models.validate_session(fields, rows)
            else:
                X, _, _, mask, _, _ = train_models.prepare_dataset(fields, rows)
                train = X[mask]
            medians = np.median(train, axis=0).tolist()
        bundle['feature_medians'] = medians
        return bundle
