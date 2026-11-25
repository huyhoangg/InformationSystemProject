#!/usr/bin/env python3
"""Train KNN, Gaussian Naive Bayes, Decision Tree and Random Forest from a driving session.
Python 3.8 compatible; no ROS process needed. Outputs are created beside script.
Example: /usr/bin/python3 train_models.py --data data/manual_20261118_025829_54af3040.csv
Evaluation supports a separate captured session or a holdout within one session.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
from datetime import datetime, timezone
from time import perf_counter
import uuid

import joblib
import numpy as np
import sklearn
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from sklearn.metrics import f1_score, classification_report, confusion_matrix

FEATURES = ['left', 'front_left', 'front', 'front_right', 'right']
ODOMETRY_AND_GOAL_FEATURES = ['linear_velocity', 'angular_velocity', 'goal_distance', 'goal_angle']
NAVIGATION_FEATURES = FEATURES + ODOMETRY_AND_GOAL_FEATURES
ACTIONS = {'forward': [0.30, 0.0], 'left': [0.0, 0.70], 'right': [0.0, -0.70]}
NAVIGATION_ACTIONS = {**ACTIONS, 'stop': [0.0, 0.0]}
GAP_SECONDS = 2.0
BEFORE_COMMAND = 'before_command'


def capture_timing(rows):
    if rows and all(row.get('capture_timing') == BEFORE_COMMAND for row in rows):
        return BEFORE_COMMAND
    return 'unknown'


def read_csv(data):
    with io.StringIO(data.decode('utf-8-sig'), newline='') as source:
        reader = csv.DictReader(source, strict=True)
        return reader.fieldnames or [], list(reader)


def split_strategy(fields):
    return 'by_run' if 'run_id' in fields else 'temporal_holdout'


def split_masks(fields, rows, times):
    # Set the split using order and size. Labels and test scores do not affect it.
    target = int(len(rows) * 0.70)
    if split_strategy(fields) == 'temporal_holdout':
        boundary = times[target]
        return times < boundary - GAP_SECONDS, times > boundary + GAP_SECONDS, boundary

    run_ids = [row['run_id'] for row in rows]
    if not all(run_ids):
        raise ValueError('Every sample in this CSV needs a navigation run ID.')
    boundaries = [index for index in range(1, len(rows)) if run_ids[index] != run_ids[index - 1]]
    if len(set(run_ids)) != len(boundaries) + 1:
        raise ValueError('Keep samples from each navigation run together in chronological order.')
    if not boundaries:
        raise ValueError('Record samples in at least two manual runs to split by navigation run.')
    index = min(boundaries, key=lambda offset: abs(offset - target))
    boundary = times[index]
    return times < boundary, times >= boundary, boundary


def validate_session(fields, rows):
    features = NAVIGATION_FEATURES
    actions = NAVIGATION_ACTIONS
    required = features + ['action', 'scan_time', 'session_id', 'world', 'linear_x', 'angular_z']
    missing = [name for name in required if name not in fields]
    if missing:
        raise ValueError('Missing CSV columns: ' + ', '.join(missing))
    if len(set(fields)) != len(fields) or any(None in row for row in rows):
        raise ValueError('CSV has duplicate headers or rows with extra columns.')
    if len(rows) < 50:
        raise ValueError('At least 50 samples are required to split the dataset.')
    sessions = {row['session_id'] for row in rows}
    if len(sessions) != 1 or not rows[0]['session_id']:
        raise ValueError('Choose a CSV containing exactly one driving session.')
    if len({row['world'] for row in rows}) != 1 or not rows[0]['world']:
        raise ValueError('Choose a CSV recorded on exactly one world.')
    try:
        X = np.array([[float(row[k]) for k in features] for row in rows])
        y = np.array([row['action'] for row in rows])
        times = np.array([float(row['scan_time']) for row in rows])
        commands = np.array([[float(row['linear_x']), float(row['angular_z'])] for row in rows])
    except (TypeError, ValueError) as error:
        raise ValueError('CSV contains missing or invalid numeric values.') from error
    if not np.isfinite(X).all() or (X[:, :len(FEATURES)] < 0).any() or not np.isfinite(times).all():
        raise ValueError('Features and scan times must be finite. LiDAR distances must be nonnegative.')
    distances, angles = X[:, -2], X[:, -1]
    if (distances < 0).any() or (np.abs(angles) > np.pi + 1e-6).any():
        raise ValueError('Goal distance must be nonnegative and goal angle in radians within [-pi, pi].')
    if not (np.diff(times) > 0).all():
        raise ValueError('Scan times must increase strictly within the session.')
    if set(y) != set(actions):
        raise ValueError('The dataset must contain exactly these labels: ' + ', '.join(actions))
    expected = np.array([actions[label] for label in y])
    if not np.allclose(commands, expected, atol=1e-6):
        forward, turn = actions['forward'][0], actions['left'][1]
        raise ValueError(f'Use a session recorded with commands of {forward:.2f} m/s and +/-{turn:.2f} rad/s.')

    return X, y, times


def prepare_dataset(fields, rows):
    X, y, times = validate_session(fields, rows)
    actions = NAVIGATION_ACTIONS
    train, test, boundary = split_masks(fields, rows, times)
    for name, mask in [('train', train), ('test', test)]:
        if set(y[mask]) != set(actions):
            missing = ', '.join(label for label in actions if label not in y[mask])
            raise ValueError(f'The {name} split needs more examples of these actions: {missing}.')
    if train.sum() < 5:
        raise ValueError('KNN needs at least five training samples.')
    return X, y, times, train, test, boundary


def train_models(path, model_dir, result_dir, test_path=None):
    data = path.read_bytes()
    fields, rows = read_csv(data)
    features = NAVIGATION_FEATURES
    test_manifest = {}
    if test_path is None:
        X, y, times, train, test, boundary = prepare_dataset(fields, rows)
        X_train, y_train, X_test, y_test = X[train], y[train], X[test], y[test]
        test_indices = np.flatnonzero(test)
        strategy = split_strategy(fields)
        excluded = int((~(train | test)).sum())
        limitation = 'Single-session holdout. Offline action scores do not measure live navigation success.'
    else:
        test_data = test_path.read_bytes()
        test_fields, test_rows = read_csv(test_data)
        X_train, y_train, _ = validate_session(fields, rows)
        X_test, y_test, times = validate_session(test_fields, test_rows)
        if rows[0]['session_id'] == test_rows[0]['session_id']:
            raise ValueError('Choose a separate recording session for testing.')
        if rows[0]['world'] != test_rows[0]['world']:
            raise ValueError('Train and test sessions must use the same world.')
        test_manifest = dict(test_file=test_path.name, test_sha256=hashlib.sha256(test_data).hexdigest(),
                             test_session_id=test_rows[0]['session_id'])
        test_indices = np.arange(len(test_rows))
        strategy, boundary, excluded = 'by_session', None, 0
        limitation = 'Separate recording sessions in the same world. Navigation requires separate live trials.'
    actions = NAVIGATION_ACTIONS
    labels = list(actions)
    model_dir.mkdir(parents=True)
    result_dir.mkdir(parents=True)
    models = {
        'knn': make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5, weights='distance')),
        'naive_bayes': make_pipeline(StandardScaler(), GaussianNB()),
        'decision_tree': DecisionTreeClassifier(max_depth=5, min_samples_leaf=5, class_weight='balanced', random_state=42),
        'random_forest': RandomForestClassifier(n_estimators=100, max_depth=8, min_samples_leaf=5,
                                                class_weight='balanced', random_state=42, n_jobs=1),
        'baseline': DummyClassifier(strategy='most_frequent'),
    }
    total = len(y_train) + len(y_test) + excluded
    params = {name: {key: value for key, value in model.get_params(deep=True).items()
                     if value is None or isinstance(value, (str, bool, int, float))}
              for name, model in models.items()}
    print(f'Total {total} | Train {len(y_train)} | Test {len(y_test)} | Excluded {excluded} | {strategy}')
    metrics = []
    reports = {}
    predictions = {}
    fit_seconds = {}
    for name, model in models.items():
        start = perf_counter()
        model.fit(X_train, y_train)
        fit_seconds[name] = perf_counter() - start
        predicted = model.predict(X_test)
        predictions[name] = predicted
        score = {
            'model': name,
            'accuracy': float(accuracy_score(y_test, predicted)),
            'balanced_accuracy': float(balanced_accuracy_score(y_test, predicted)),
            'macro_f1': float(f1_score(y_test, predicted, labels=labels, average='macro', zero_division=0)),
        }
        metrics.append(score)
        reports[name] = classification_report(y_test, predicted, labels=labels, output_dict=True, zero_division=0)
        with (result_dir / (name + '_confusion.csv')).open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['true/predicted'] + labels)
            for label, values in zip(labels, confusion_matrix(y_test, predicted, labels=labels)):
                writer.writerow([label] + values.tolist())
        if name != 'baseline':
            joblib.dump({'model': model, 'feature_names': features, 'actions': actions,
                         'sector_centers_deg': [90, 45, 0, -45, -90], 'half_width_deg': 10.0,
                         'sklearn_version': sklearn.__version__, 'training_scope': 'train_split_only',
                         'world': rows[0]['world']},
                        model_dir / (name + '.joblib'))
        print('{:15s} Accuracy={:.1%} Balanced={:.1%} Macro-F1={:.3f}'.format(
            name, score['accuracy'], score['balanced_accuracy'], score['macro_f1']))
    with (result_dir / 'metrics.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(metrics[0]))
        writer.writeheader()
        writer.writerows(metrics)
    with (result_dir / 'test_predictions.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['source_csv_row', 'scan_time', 'true_action'] + list(models))
        for j, index in enumerate(test_indices):
            writer.writerow([int(index) + 2, times[index], y_test[j]] + [predictions[n][j] for n in models])
    manifest = {
        'source_file': path.name, 'sha256': hashlib.sha256(data).hexdigest(),
        'session_id': rows[0]['session_id'], 'sklearn_version': sklearn.__version__,
        'world': rows[0]['world'], 'features': features, 'labels': labels, 'capture_timing': capture_timing(rows),
        'total': total, 'train': len(y_train), 'test': len(y_test), 'excluded_gap': excluded,
        'boundary_scan_time': float(boundary) if boundary is not None else None,
        'split_strategy': strategy, 'gap_seconds_each_side': GAP_SECONDS if strategy == 'temporal_holdout' else 0.0,
        'actions': actions, 'model_params': params,
        'trained_at': datetime.now(timezone.utc).isoformat(), 'fit_seconds': fit_seconds,
        'feature_medians': np.median(X_train, axis=0).tolist(),
        'split_class_counts': {name: {label: int(np.sum(target == label)) for label in labels}
                               for name, target in [('train', y_train), ('test', y_test)]},
        'limitation': limitation,
        **test_manifest,
    }
    (result_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (result_dir / 'classification_reports.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
    print('\nMo hinh:', model_dir)
    print('Ket qua:', result_dir)
    print('Cac mau gan vat can van duoc giu nguyen; can xem lai nhan khi cai thien du lieu.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--test-data', type=Path, help='Use an independent recorded session as the test set.')
    parser.add_argument('--output', type=Path, help='Write models/ and results/ under this directory.')
    args = parser.parse_args()
    if args.output is None:
        root = Path(__file__).resolve().parent
        run_id = datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:6]
        model_dir, result_dir = root / 'models' / run_id, root / 'results' / run_id
    else:
        model_dir, result_dir = args.output / 'models', args.output / 'results'
    try:
        train_models(args.data.expanduser().resolve(), model_dir, result_dir, args.test_data)
    except (csv.Error, OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
