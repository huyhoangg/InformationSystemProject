"""Manage datasets, training jobs and model artifacts without a ROS dependency."""

from collections import Counter
import csv
from datetime import datetime, timezone
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
import sklearn

from inputs import lidar_features, train_models
from navigation_history import write_atomically


ROOT = Path(__file__).resolve().parent
MODEL_LABELS = {
    'knn': 'KNN', 'naive_bayes': 'Gaussian Naive Bayes', 'decision_tree': 'Decision Tree',
    'random_forest': 'Random Forest', 'baseline': 'Majority baseline', 'svm': 'SVM',
}
MAX_CSV_BYTES = 4 * 1024 * 1024
RUN_ID = re.compile(r'\d{8}_\d{6}_[a-f0-9]{6}')
SESSION_ID = re.compile(r'\d{8}T\d{12}Z')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def preview_dataset(data):
    try:
        fields, rows = train_models.read_csv(data)
    except (UnicodeError, csv.Error) as error:
        raise ValueError('Choose a valid UTF-8 CSV file.') from error
    features = train_models.dataset_features(fields)
    actions = train_models.FEATURE_PROFILES[tuple(features)]
    preview_fields = ['scan_time', *features, 'action']
    counts = Counter(row.get('action') for row in rows)
    strategy = train_models.split_strategy(fields)
    run_count = len({row['run_id'] for row in rows if row['run_id']}) if strategy == 'by_run' else None
    summary = dict(total=len(rows), fields=preview_fields, capture_timing=train_models.capture_timing(features, rows),
                   split_strategy=strategy, navigation_run_count=run_count,
                   rows=[[row.get(name) for name in preview_fields] for row in rows[:6]],
                   counts={label: counts[label] for label in actions})
    try:
        _, _, _, train, test, _ = train_models.prepare_dataset(fields, rows)
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

    def sessions(self):
        return [path.stem for path in sorted((self.runs_dir / 'sessions').glob('*.csv'), reverse=True)
                if SESSION_ID.fullmatch(path.stem)]

    def dataset(self, request, manual_csv):
        source = request.get('source')
        if source == 'reference':
            data, name = (self.reference / 'dataset.csv').read_bytes(), 'Hiển · Reference driving session'
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
        return data, dict(source=source, name=name)

    def directory(self, run_id):
        if run_id == 'reference':
            return self.reference
        if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id):
            raise ValueError('Invalid training run ID.')
        directory = self.runs_dir / run_id
        if not (directory / 'run.json').is_file():
            raise FileNotFoundError('Training run not found.')
        return directory

    def state(self):
        with self.lock:
            job = self.job.copy() if self.job else None
            runs = [read_json(path) for path in sorted(self.runs_dir.glob('*/run.json'), reverse=True)
                    if RUN_ID.fullmatch(path.parent.name)]
        runs.append(dict(id='reference', dataset='Hiển · Reference driving session'))
        return dict(runs=runs, job=job)

    def start(self, data, dataset):
        with self.lock:
            if self.job and self.job['status'] == 'running':
                raise RuntimeError('A training run is already in progress.')
            now = datetime.now(timezone.utc)
            run_id = now.strftime('%Y%m%d_%H%M%S_') + uuid4().hex[:6]
            run = dict(id=run_id, dataset=dataset['name'], source=dataset['source'], started_at=now.isoformat())
            self.job = dict(run, status='running')
            Thread(target=self.train, args=(run, data), daemon=True).start()
            return self.job.copy()

    def train(self, run, data):
        try:
            with TemporaryDirectory(prefix='.training-', dir=self.runs_dir) as temporary:
                output = Path(temporary) / 'run'
                output.mkdir()
                dataset = output / 'dataset.csv'
                dataset.write_bytes(data)
                completed = subprocess.run(
                    [sys.executable, str(ROOT / 'inputs' / 'train_models.py'), '--data', str(dataset),
                     '--output', str(output)], capture_output=True, text=True, encoding='utf-8',
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
        manifest = read_json(results / 'manifest.json')
        classifications = read_json(results / 'classification_reports.json')
        with (results / 'metrics.csv').open(newline='', encoding='utf-8') as source:
            metrics = list(csv.DictReader(source))
        models = []
        for row in metrics:
            model = row['model']
            with (results / f'{model}_confusion.csv').open(newline='', encoding='utf-8') as source:
                header, *matrix = csv.reader(source)
            classes = header[1:]
            scores = classifications[model]
            models.append(dict(id=model, label=MODEL_LABELS[model], labels=classes,
                               deployable=model != 'baseline',
                               confusion=[[int(value) for value in line[1:]] for line in matrix],
                               accuracy=float(row['accuracy']), balanced_accuracy=float(row['balanced_accuracy']),
                               macro_f1=float(row['macro_f1']), precision=scores['macro avg']['precision'],
                               recall=scores['macro avg']['recall'], per_class={c: scores[c] for c in classes}))
        features = manifest.get('features', train_models.FEATURES)
        timing = manifest.get('capture_timing', 'unknown' if features == train_models.NAVIGATION_FEATURES else None)
        return dict(id=run_id, total=manifest['total'], train=manifest['train'], test=manifest['test'],
                    excluded_gap=manifest['excluded_gap'], features=features, capture_timing=timing,
                    split_strategy=manifest.get('split_strategy', 'temporal_holdout'),
                    session_id=manifest['session_id'], class_counts=manifest['split_class_counts'], models=models)

    def mistakes(self, run_id, model, actual, predicted):
        directory = self.directory(run_id)
        manifest = read_json(directory / 'results' / 'manifest.json')
        features = manifest.get('features', train_models.FEATURES)
        actions = train_models.FEATURE_PROFILES[tuple(features)]
        if model not in MODEL_LABELS or actual == predicted or any(
                label not in actions for label in (actual, predicted)):
            raise ValueError('Choose a model and an off-diagonal confusion cell.')
        _, rows = train_models.read_csv((directory / 'dataset.csv').read_bytes())
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

    def load_model(self, run_id, model):
        if not isinstance(model, str) or model not in MODEL_LABELS or model == 'baseline':
            raise ValueError('Choose a trained model.')
        directory = self.directory(run_id)
        path = directory / 'models' / f'{model}.joblib'
        if not path.is_file():
            raise FileNotFoundError('Model not found in this run.')
        manifest = read_json(directory / 'results' / 'manifest.json')
        if manifest['sklearn_version'] != sklearn.__version__:
            raise ValueError('Retrain the model in this app to match its scikit-learn version.')
        bundle = joblib.load(path)
        features = tuple(bundle['feature_names'])
        if (features not in train_models.FEATURE_PROFILES
                or bundle['actions'] != train_models.FEATURE_PROFILES[features]
                or tuple(bundle['sector_centers_deg']) != tuple(lidar_features.SECTOR_CENTERS_DEG)
                or bundle['half_width_deg'] != lidar_features.HALF_WIDTH_DEG):
            raise ValueError('The model does not match the robot feature and action schema.')
        return bundle
