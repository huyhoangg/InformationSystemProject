"""Store completed navigation experiments separately from training runs."""

import csv
import io
import json
from pathlib import Path
from tempfile import NamedTemporaryFile


CSV_FIELDS = (
    'id', 'session_id', 'world', 'model', 'model_run_id', 'started_at', 'ended_at',
    'start_x', 'start_y', 'start_heading_rad', 'goal_x', 'goal_y', 'goal_radius_m',
    'status', 'end_reason', 'reason', 'elapsed_s', 'distance_m', 'goal_distance_m',
    'prediction_count', 'mean_inference_ms', 'collision', 'contact_objects', 'drive_mode',
)


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

    def save(self, run):
        target = self.directory / f"{run['id']}.json"
        data = json.dumps(run, allow_nan=False, ensure_ascii=False, indent=2) + '\n'
        write_atomically(target, data.encode('utf-8'))

    def runs(self, limit=None, session_id=None):
        runs = []
        for path in sorted(self.directory.glob('*.json'), reverse=True):
            if len(runs) == limit:
                break
            run = json.loads(path.read_text(encoding='utf-8'))
            if session_id is not None and run.get('session_id') != session_id:
                continue
            runs.append(run)
        return runs

    def export_csv(self, session_id=None):
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for run in self.runs(session_id=session_id):
            row = {key: run.get(key) for key in CSV_FIELDS}
            row['contact_objects'] = ' | '.join(run['contact_objects'])
            if run['collision'] is not None:
                row['collision'] = int(run['collision'])
            writer.writerow(row)
        return output.getvalue().encode('utf-8')
