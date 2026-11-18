#!/usr/bin/env python3
"""Train four baseline classifiers from one manual TurtleBot3 session.
Python 3.8 compatible; no ROS process needed. Outputs are created beside script.
Example: /usr/bin/python3 train_models.py --data data/manual_20261118_025829_54af3040.csv
Evaluation is preliminary temporal holdout, NOT an independent robot trial.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from datetime import datetime
import uuid

import joblib
import numpy as np
import sklearn
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.naive_bayes import GaussianNB
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from sklearn.metrics import f1_score, classification_report, confusion_matrix

FEATURES = ['left', 'front_left', 'front', 'front_right', 'right']
LABELS = ['forward', 'left', 'right']
ACTIONS = {'forward': [0.30, 0.0], 'left': [0.0, 0.70], 'right': [0.0, -0.70]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    args = parser.parse_args()
    path = args.data.expanduser().resolve()
    with path.open(newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        required = FEATURES + ['action', 'scan_time', 'session_id', 'linear_x', 'angular_z']
        if not set(required).issubset(reader.fieldnames or []):
            parser.error('CSV thieu cot bat buoc: ' + ', '.join(required))
        rows = list(reader)
    if len(rows) < 50:
        parser.error('Qua it mau de chia theo thoi gian.')
    if len(set(row['session_id'] for row in rows)) != 1:
        parser.error('Ban nay danh cho MOT luot thu. Khong ghep nhieu luot vao mot file.')
    try:
        X = np.array([[float(row[k]) for k in FEATURES] for row in rows])
        y = np.array([row['action'] for row in rows])
        times = np.array([float(row['scan_time']) for row in rows])
        commands = np.array([[float(row['linear_x']), float(row['angular_z'])] for row in rows])
    except ValueError:
        parser.error('CSV co gia tri so khong hop le.')
    if not np.isfinite(X).all() or (X < 0).any() or not np.isfinite(times).all():
        parser.error('Khoang cach/thoi gian khong hop le. Kiem tra CSV truoc.')
    if not (np.diff(times) > 0).all():
        parser.error('Thoi gian phai tang nghiem ngat; co the file bi trung hoac reset.')
    if set(y) != set(LABELS):
        parser.error('Can du ba nhan forward, left, right.')
    expected = np.array([ACTIONS[label] for label in y])
    if not np.allclose(commands, expected, atol=1e-6):
        parser.error('File khong dung toc do 0.30 m/s va +/-0.70 rad/s. Chon dung luot thu.')

    # Fixed in advance. Do not move the split or tune parameters based on test scores.
    boundary = times[int(len(rows) * 0.70)]
    train = times < boundary - 2.0
    test = times > boundary + 2.0
    for name, mask in [('train', train), ('test', test)]:
        if set(y[mask]) != set(LABELS):
            parser.error('Tap ' + name + ' thieu lop; can them luot thu doc lap, khong xao tron de che loi.')
    root = Path(__file__).resolve().parent
    run_id = datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + uuid.uuid4().hex[:6]
    model_dir = root / 'models' / run_id
    result_dir = root / 'results' / run_id
    model_dir.mkdir(parents=True)
    result_dir.mkdir(parents=True)
    models = {
        'knn': make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5, weights='distance')),
        'decision_tree': DecisionTreeClassifier(max_depth=5, min_samples_leaf=5, class_weight='balanced', random_state=42),
        'svm': make_pipeline(StandardScaler(), SVC(C=1.0, kernel='rbf', gamma='scale', class_weight='balanced')),
        'naive_bayes': make_pipeline(StandardScaler(), GaussianNB()),
        'baseline': DummyClassifier(strategy='most_frequent'),
    }
    print('Tong {} | Train {} | Test {} | Bo qua vung dem {}'.format(
        len(rows), int(train.sum()), int(test.sum()), int((~(train | test)).sum())))
    print('DANH GIA SO BO: cung mot luot thu, chua danh gia tranh va cham.')
    metrics = []
    reports = {}
    predictions = {}
    for name, model in models.items():
        model.fit(X[train], y[train])
        predicted = model.predict(X[test])
        predictions[name] = predicted
        score = {
            'model': name,
            'accuracy': float(accuracy_score(y[test], predicted)),
            'balanced_accuracy': float(balanced_accuracy_score(y[test], predicted)),
            'macro_f1': float(f1_score(y[test], predicted, labels=LABELS, average='macro', zero_division=0)),
        }
        metrics.append(score)
        reports[name] = classification_report(y[test], predicted, labels=LABELS, output_dict=True, zero_division=0)
        with (result_dir / (name + '_confusion.csv')).open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['true/predicted'] + LABELS)
            for label, values in zip(LABELS, confusion_matrix(y[test], predicted, labels=LABELS)):
                writer.writerow([label] + values.tolist())
        if name != 'baseline':
            joblib.dump({'model': model, 'feature_names': FEATURES, 'actions': ACTIONS,
                         'sector_centers_deg': [90, 45, 0, -45, -90], 'half_width_deg': 10.0,
                         'sklearn_version': sklearn.__version__, 'training_scope': 'train_split_only'},
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
        for j, index in enumerate(np.flatnonzero(test)):
            writer.writerow([int(index) + 2, times[index], y[index]] + [predictions[n][j] for n in models])
    manifest = {
        'source_file': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'session_id': rows[0]['session_id'], 'sklearn_version': sklearn.__version__,
        'total': len(rows), 'train': int(train.sum()), 'test': int(test.sum()),
        'excluded_gap': int((~(train | test)).sum()), 'boundary_scan_time': float(boundary),
        'gap_seconds_each_side': 2.0, 'actions': ACTIONS,
        'split_class_counts': {n: {label: int(np.sum(y[m] == label)) for label in LABELS}
                               for n, m in [('train', train), ('test', test)]},
        'close_forward_samples_not_deleted': int(np.sum((y == 'forward') & (X[:, 2] <= 0.15))),
        'limitation': 'Single-session temporal holdout. Human labels, not collision-free ground truth. No hyperparameter search; test is not used for fitting scalers or models.'
    }
    (result_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (result_dir / 'classification_reports.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
    print('\nMo hinh:', model_dir)
    print('Ket qua:', result_dir)
    print('Cac mau gan vat can van duoc giu nguyen; can xem lai nhan khi cai thien du lieu.')


if __name__ == '__main__':
    main()
