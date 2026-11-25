"""Store completed navigation experiments separately from training runs."""

import csv
from collections import defaultdict
import io
import json
import math
from pathlib import Path
import re
from statistics import mean
from tempfile import NamedTemporaryFile


CSV_FIELDS = (
    'id', 'session_id', 'world', 'model', 'model_run_id', 'started_at', 'ended_at',
    'start_x', 'start_y', 'start_heading_rad', 'goal_x', 'goal_y', 'goal_radius_m',
    'status', 'end_reason', 'reason', 'elapsed_s', 'distance_m', 'goal_distance_m',
    'prediction_count', 'mean_inference_ms', 'collision', 'contact_objects', 'drive_mode', 'model_dataset_sha256',
    'cycle_count', 'comparison_eligible',
)
TRACE_FIELDS = (
    'run_id', 'cycle', 'elapsed_s', 'scan_time', 'drive_mode', 'model_run_id', 'model', 'model_dataset_sha256',
    'model_action', 'operator_action', 'command', 'confidence', 'inference_ms',
    'shadow_run_id', 'shadow_model', 'shadow_dataset_sha256', 'shadow_action', 'shadow_confidence', 'shadow_inference_ms',
    'left', 'front_left', 'front', 'front_right', 'right', 'linear_velocity', 'angular_velocity',
    'goal_distance', 'goal_angle', 'goal_x', 'goal_y', 'expert_action',
)


def trace_csv(trace, columns):
    if not columns or len(set(columns)) != len(columns) or any(field not in TRACE_FIELDS for field in columns):
        raise ValueError('Choose valid trace columns.')
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(trace['rows'])
    return output.getvalue().encode('utf-8')


def trace_preview(trace):
    rows = trace['rows']
    compared = [row for row in rows if row['shadow_action'] is not None]
    sizes = {field: sum(len(str(row[field])) for row in rows if row.get(field) is not None) for field in TRACE_FIELDS}
    return {**trace, 'rows': rows[-250:], 'cycle_count': len(rows), 'events': trace['events'][-250:],
            'csv_value_sizes': sizes,
            'compared': len(compared), 'agreements': sum(r['model_action'] == r['shadow_action'] for r in compared),
            'shadow_mean_ms': mean(r['shadow_inference_ms'] for r in compared) if compared else None,
            'expert_scored': sum(row.get('expert_action') is not None for row in rows)}


def write_atomically(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    output = NamedTemporaryFile(dir=path.parent, suffix='.tmp', delete=False)
    temporary = Path(output.name)
    try:
        with output:
            output.write(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class NavigationHistory:
    def __init__(self, directory):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def save(self, run, trace=None):
        if trace is not None:
            data = json.dumps(trace, allow_nan=False, ensure_ascii=False, separators=(',', ':'))
            write_atomically(self.directory / 'cycles' / f"{run['id']}.json", data.encode('utf-8'))
        target = self.directory / f"{run['id']}.json"
        data = json.dumps(run, allow_nan=False, ensure_ascii=False, indent=2) + '\n'
        write_atomically(target, data.encode('utf-8'))

    def trace(self, run_id, world):
        if not isinstance(run_id, str) or not re.fullmatch(r'\d{8}_\d{6}_\d{6}_[0-9a-f]{6}', run_id):
            raise ValueError('Choose a valid navigation run.')
        path = self.directory / 'cycles' / f'{run_id}.json'
        try:
            result = json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            raise FileNotFoundError('Cycle log is unavailable for this run.') from None
        if result['world'] != world:
            raise FileNotFoundError('Cycle log is unavailable for this map.')
        return result

    def runs(self, limit=None, session_id=None, world=None):
        runs = []
        for path in sorted(self.directory.glob('*.json'), reverse=True):
            if len(runs) == limit:
                break
            run = json.loads(path.read_text(encoding='utf-8'))
            if session_id is not None and run.get('session_id') != session_id:
                continue
            if world is not None and run.get('world') != world:
                continue
            runs.append(run)
        return runs

    def export_csv(self, session_id=None, world=None):
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for run in self.runs(session_id=session_id, world=world):
            row = {key: run.get(key) for key in CSV_FIELDS}
            row['contact_objects'] = ' | '.join(run['contact_objects'])
            if run['collision'] is not None:
                row['collision'] = int(run['collision'])
            writer.writerow(row)
        return output.getvalue().encode('utf-8')

    def comparison(self, world, training_ids):
        scenarios = defaultdict(lambda: defaultdict(list))
        for run in self.runs(world=world):
            if (run.get('drive_mode') != 'auto' or run.get('model_run_id') not in training_ids
                    or not run.get('comparison_eligible', True)):
                continue
            origin = (round(run['start_x'], 1), round(run['start_y'], 1),
                      round(math.degrees(run['start_heading_rad']) / 5) * 5)
            goal = (run['goal_x'], run['goal_y'], run['goal_radius_m'])
            revision = run.get('model_dataset_sha256') or ''
            scenarios[origin, goal][run['model_run_id'], run['model_label'], revision].append(run)
        results = []
        for (origin, goal), models in sorted(scenarios.items()):
            rows = []
            for (run_id, model, revision), runs in sorted(models.items()):
                collision = [run['collision'] for run in runs if run['collision'] is not None]
                inference = [run['mean_inference_ms'] for run in runs if run['mean_inference_ms'] is not None]
                rows.append(dict(run_id=run_id, model=model, dataset_revision=revision, attempts=len(runs),
                                 reached=sum(run['status'] == 'reached' for run in runs),
                                 collisions=sum(collision), contact_measured=len(collision),
                                 elapsed_s=mean(run['elapsed_s'] for run in runs),
                                 distance_m=mean(run['distance_m'] for run in runs),
                                 inference_ms=mean(inference) if inference else None))
            results.append(dict(origin=origin, goal=goal, models=rows))
        return results
