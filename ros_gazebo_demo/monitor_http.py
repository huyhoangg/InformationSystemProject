"""Serve both Navigation Monitor tabs with either a live or an offline robot adapter."""

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import logging
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from ds_workspace import MAX_CSV_BYTES, MODEL_LABELS, ROOT, Workspace, preview_dataset
from inputs.lidar_features import FEATURE_NAMES, HALF_WIDTH_DEG, SECTOR_CENTERS_DEG
from inputs.train_models import NAVIGATION_FEATURES
from navigation_history import NavigationHistory
from prepare_models import prepare


REFERENCE = ROOT / 'reference'
RUNS = ROOT / 'runs'
DATA_FIELDS = ['session_id', 'world', 'scan_time', 'wall_time', *NAVIGATION_FEATURES,
               'action', 'linear_x', 'angular_z', 'capture_timing', 'run_id', 'goal_x', 'goal_y', 'label_source']
STATIC_TYPES = {
    'Navigation Monitor.html': 'text/html', 'styles.css': 'text/css',
    **{name: 'text/javascript' for name in ('sim.jsx', 'icons.jsx', 'components.jsx', 'live.jsx',
                                           'ds-workspace.jsx', 'app.jsx')},
}


class OfflineRobot:
    adapter = 'Offline datasets'
    map = None

    def __init__(self):
        self.selection = 'reference', 'knn'

    def select_model(self, run_id, model, bundle):
        self.selection = run_id, model

    def status(self):
        run_id, model = self.selection
        return dict(ready=False, mode='idle', active_run=run_id, active_model=model,
                    active_model_label=MODEL_LABELS[model], recorded=0)

    def manual_csv(self):
        return (','.join(DATA_FIELDS) + '\n').encode('utf-8')

    def control(self, request):
        raise RuntimeError('The robot is unavailable in offline mode.')


class MonitorServer(ThreadingHTTPServer):
    def __init__(self, address, robot, workspace, navigation_history=None):
        super().__init__(address, MonitorRequest)
        self.robot = robot
        self.workspace = workspace
        self.navigation_history = navigation_history or NavigationHistory(workspace.runs_dir / 'navigation')
        self.web_root = ROOT / 'web' if (ROOT / 'web').is_dir() else ROOT.parent
        self.setup = dict(map=robot.map, goal=getattr(robot, 'goal', None),
                          adapter=robot.adapter, report=workspace.report('reference'),
                          sector_angles=dict(zip(FEATURE_NAMES, SECTOR_CENTERS_DEG)), half_width=HALF_WIDTH_DEG)


class MonitorRequest(BaseHTTPRequestHandler):
    def send_data(self, content, media_type, status=HTTPStatus.OK, filename=None):
        self.send_response(status)
        self.send_header('Content-Type', f'{media_type}; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, value, status=HTTPStatus.OK):
        self.send_data(json.dumps(value, allow_nan=False).encode('utf-8'), 'application/json', status)

    def log_request(self, code='-', size='-'):
        path = urlsplit(self.path).path
        if path not in ('/api/status', '/api/ds/runs') or str(code) != '200':
            super().log_request(code, size)

    def do_GET(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        robot, workspace = self.server.robot, self.server.workspace
        try:
            if path == '/':
                fragment = '#ds' if robot.map is None else ''
                self.send_response(HTTPStatus.FOUND)
                self.send_header('Location', '/Navigation%20Monitor.html?live=1' + fragment)
                self.end_headers()
            elif path == '/api/status':
                self.send_json(robot.status())
            elif path == '/api/setup':
                self.send_json(self.server.setup)
            elif path == '/api/dataset/reference.csv':
                self.send_data((workspace.reference / 'dataset.csv').read_bytes(), 'text/csv',
                               filename='reference-driving.csv')
            elif path == '/api/dataset/manual.csv':
                self.send_data(robot.manual_csv(), 'text/csv', filename='gazebo-manual-driving.csv')
            elif path == '/api/dataset/sessions':
                self.send_json({'sessions': workspace.sessions()})
            elif path.startswith('/api/dataset/sessions/') and path.endswith('.csv'):
                session_id = path.removeprefix('/api/dataset/sessions/').removesuffix('.csv')
                dataset = workspace.session_csv_path(session_id)
                if not dataset.is_file():
                    raise FileNotFoundError('Driving session not found.')
                self.send_data(dataset.read_bytes(), 'text/csv', filename=dataset.name)
            elif path == '/api/navigation/runs':
                session_id = parse_qs(url.query).get('session', [None])[0]
                self.send_json({'runs': self.server.navigation_history.runs(limit=20, session_id=session_id)})
            elif path == '/api/navigation/runs.csv':
                session_id = parse_qs(url.query).get('session', [None])[0]
                self.send_data(self.server.navigation_history.export_csv(session_id), 'text/csv',
                               filename='navigation-runs.csv')
            elif path == '/api/ds/runs':
                self.send_json(workspace.state())
            elif path.startswith('/api/ds/runs/'):
                self.get_run(path.removeprefix('/api/ds/runs/'), url.query)
            elif path[1:] in STATIC_TYPES:
                name = path[1:]
                self.send_data((self.server.web_root / name).read_bytes(), STATIC_TYPES[name])
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_json({'error': str(error)}, HTTPStatus.BAD_REQUEST)
        except FileNotFoundError as error:
            self.send_json({'error': str(error)}, HTTPStatus.NOT_FOUND)

    def get_run(self, suffix, query):
        run_id, _, resource = suffix.partition('/')
        workspace = self.server.workspace
        if resource == 'mistakes':
            params = parse_qs(query)
            self.send_json(workspace.mistakes(run_id, *(params.get(name, [''])[0]
                                                       for name in ('model', 'actual', 'predicted'))))
        elif resource == 'dataset.csv':
            data = (workspace.directory(run_id) / 'dataset.csv').read_bytes()
            self.send_data(data, 'text/csv', filename=f'{run_id}-dataset.csv')
        elif resource == '':
            self.send_json(workspace.report(run_id))
        else:
            self.send_json({'error': 'Run resource not found.'}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ('/api/control', '/api/ds/preview', '/api/ds/runs'):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        origin = self.headers.get('Origin')
        if (origin and origin != f'http://{self.headers.get("Host")}') or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send_json({'error': 'Requests must come from the monitor origin.'}, HTTPStatus.FORBIDDEN)
            return
        robot, workspace = self.server.robot, self.server.workspace
        try:
            limit = 1024 if path == '/api/control' else 2 * MAX_CSV_BYTES
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= limit or self.headers.get_content_type() != 'application/json':
                raise ValueError('Expected a JSON request within the size limit.')
            request = json.loads(self.rfile.read(size))
            if not isinstance(request, dict):
                raise ValueError('Expected a JSON object.')
            if path == '/api/control':
                if request.get('command') == 'model':
                    run_id, model = request.get('run_id', 'reference'), request.get('model')
                    robot.select_model(run_id, model, workspace.load_model(run_id, model))
                else:
                    robot.control(request)
                self.send_json(robot.status())
            else:
                data, dataset = workspace.dataset(request, robot.manual_csv)
                if path == '/api/ds/preview':
                    self.send_json(preview_dataset(data))
                else:
                    self.send_json(workspace.start(data, dataset), HTTPStatus.ACCEPTED)
        except ValueError as error:
            self.send_json({'error': str(error)}, HTTPStatus.BAD_REQUEST)
        except FileNotFoundError as error:
            self.send_json({'error': str(error)}, HTTPStatus.NOT_FOUND)
        except RuntimeError as error:
            self.send_json({'error': str(error)}, HTTPStatus.CONFLICT)


def main():
    parser = argparse.ArgumentParser(description='Run the Navigation Monitor with offline datasets.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--reference-dir', type=Path, default=REFERENCE)
    parser.add_argument('--runs-dir', type=Path, default=RUNS)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if not args.reference_dir.exists():
        prepare(args.reference_dir)
    workspace = Workspace(args.reference_dir, args.runs_dir)
    with MonitorServer((args.host, args.port), OfflineRobot(), workspace) as server:
        print(f'Offline DS Workspace at http://{args.host}:{server.server_port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
