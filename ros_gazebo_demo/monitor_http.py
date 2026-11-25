"""Serve both Navigation Monitor tabs with either a live or an offline robot adapter."""

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from ds_workspace import MAX_CSV_BYTES, MODEL_LABELS, ROOT, Workspace, preview_dataset
from inputs.lidar_features import FEATURE_NAMES, HALF_WIDTH_DEG, SECTOR_CENTERS_DEG
from inputs.train_models import NAVIGATION_FEATURES
from navigation_history import NavigationHistory, TRACE_FIELDS, trace_csv, trace_preview
from prepare_models import prepare
from scenarios import DEFAULT_SCENARIO, SCENARIOS, package_id


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
    live = False

    def __init__(self):
        self.scenario = DEFAULT_SCENARIO
        self.selections = {}

    def select_model(self, run_id, model, bundle, *, scenario=None, hot_swap=False, as_shadow=False):
        if scenario is not None and scenario != self.scenario:
            raise RuntimeError('The active map changed. Try the command again.')
        if as_shadow:
            raise RuntimeError('Shadow B requires a live simulator.')
        if bundle['world'] != SCENARIOS[self.scenario]['world']:
            raise ValueError('Select a model trained on this map.')
        self.selections[self.scenario] = (run_id, model)

    def status(self):
        run_id, model = self.selections.get(self.scenario, (None, None))
        return dict(ready=False, mode='idle', scenario=self.scenario, map=None,
                    active_run=run_id, active_model=model, active_model_label=MODEL_LABELS.get(model), recorded=0)

    def manual_csv(self, scenario):
        return (','.join(DATA_FIELDS) + '\n').encode('utf-8')

    def control(self, request):
        if request.get('command') == 'select_scenario':
            scenario = request.get('scenario')
            if isinstance(scenario, str) and scenario in SCENARIOS:
                self.scenario = scenario
                return
            raise ValueError('Choose an available map.')
        raise RuntimeError('The robot is unavailable in offline mode.')


class MonitorServer(ThreadingHTTPServer):
    def __init__(self, address, robot, workspace, navigation_history=None):
        super().__init__(address, MonitorRequest)
        self.robot = robot
        self.workspace = workspace
        self.navigation_history = navigation_history or NavigationHistory(workspace.runs_dir / 'navigation')
        self.web_root = ROOT / 'web' if (ROOT / 'web').is_dir() else ROOT.parent
        self.setup = dict(live=robot.live, adapter=robot.adapter,
                          scenarios=[dict(id=key, label=value['label'], robot=value['robot'],
                                          dataset_note=value['dataset_note'])
                                     for key, value in SCENARIOS.items()],
                          reports={key: workspace.packaged_report(key) for key in SCENARIOS},
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
        if path not in ('/api/status', '/api/ds/runs', '/api/navigation/cycles') or str(code) != '200':
            super().log_request(code, size)

    def do_GET(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        robot, workspace = self.server.robot, self.server.workspace
        try:
            query = parse_qs(url.query)
            scenario = query.get('scenario', [robot.scenario])[0]
            if scenario not in SCENARIOS:
                raise ValueError('Choose an available map.')
            if path == '/':
                fragment = '' if robot.live else '#ds'
                self.send_response(HTTPStatus.FOUND)
                self.send_header('Location', '/Navigation%20Monitor.html?live=1' + fragment)
                self.end_headers()
            elif path == '/api/status':
                self.send_json(robot.status())
            elif path == '/api/setup':
                self.send_json(self.server.setup)
            elif path == '/api/dataset/packaged.csv':
                data = (workspace.directory(package_id(scenario)) / 'dataset.csv').read_bytes()
                self.send_data(data, 'text/csv', filename=f'{scenario}-driving.csv')
            elif path == '/api/dataset/manual.csv':
                self.send_data(robot.manual_csv(scenario), 'text/csv', filename=f'{scenario}-manual-driving.csv')
            elif path == '/api/dataset/sessions':
                self.send_json({'sessions': workspace.sessions(SCENARIOS[scenario]['world'])})
            elif path.startswith('/api/dataset/sessions/') and path.endswith('.csv'):
                session_id = path.removeprefix('/api/dataset/sessions/').removesuffix('.csv')
                dataset = workspace.session_csv_path(session_id)
                if workspace.csv_world(dataset) != SCENARIOS[scenario]['world']:
                    raise FileNotFoundError('Driving session not found.')
                self.send_data(dataset.read_bytes(), 'text/csv', filename=dataset.name)
            elif path == '/api/navigation/runs':
                session_id = query.get('session', [None])[0]
                self.send_json({'runs': self.server.navigation_history.runs(limit=20, session_id=session_id,
                                                                           world=SCENARIOS[scenario]['world'])})
            elif path == '/api/navigation/runs.csv':
                session_id = query.get('session', [None])[0]
                self.send_data(self.server.navigation_history.export_csv(session_id, world=SCENARIOS[scenario]['world']), 'text/csv',
                               filename='navigation-runs.csv')
            elif path == '/api/navigation/comparison':
                training_ids = {run['id'] for run in workspace.state(scenario)['runs']}
                self.send_json({'scenarios': self.server.navigation_history.comparison(
                    SCENARIOS[scenario]['world'], training_ids)})
            elif path in ('/api/navigation/cycles', '/api/navigation/cycles.csv'):
                run_id = query.get('run', [None])[0]
                trace = robot.trace(scenario, run_id) if robot.live else None
                if trace is None and run_id is not None:
                    trace = self.server.navigation_history.trace(run_id, SCENARIOS[scenario]['world'])
                if path.endswith('.csv'):
                    if trace is None:
                        raise FileNotFoundError('No cycle log is available.')
                    columns = query.get('column', TRACE_FIELDS)
                    self.send_data(trace_csv(trace, columns), 'text/csv', filename=f"{trace['id']}-cycles.csv")
                else:
                    self.send_json(dict(trace=trace_preview(trace) if trace else None, columns=TRACE_FIELDS))
            elif path == '/api/navigation/explanation':
                self.send_json({'explanation': robot.explain(scenario) if robot.live else None})
            elif path == '/api/ds/runs':
                self.send_json(workspace.state(scenario))
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
        except RuntimeError as error:
            self.send_json({'error': str(error)}, HTTPStatus.CONFLICT)

    def get_run(self, suffix, query):
        run_id, _, resource = suffix.partition('/')
        workspace = self.server.workspace
        if resource == 'mistakes':
            params = parse_qs(query)
            self.send_json(workspace.mistakes(run_id, *(params.get(name, [''])[0]
                                                       for name in ('model', 'actual', 'predicted'))))
        elif resource in ('dataset.csv', 'test_dataset.csv'):
            directory = workspace.directory(run_id)
            workspace.run_manifest(directory)
            data = (directory / resource).read_bytes()
            self.send_data(data, 'text/csv', filename=f'{run_id}-{resource}')
        elif resource == 'decision-tree.json':
            self.send_data(workspace.export_tree(run_id), 'application/json', filename=f'{run_id}-decision-tree.json')
        elif resource == '':
            self.send_json(workspace.report(run_id))
        else:
            self.send_json({'error': 'Run resource not found.'}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ('/api/control', '/api/ds/preview', '/api/ds/runs', '/api/ds/models/import'):
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
                if request.get('command') in ('model', 'shadow'):
                    run_id, model = request.get('run_id'), request.get('model')
                    robot.select_model(run_id, model, workspace.load_model(run_id, model),
                                       scenario=request.get('scenario'), hot_swap=request.get('hot_swap') is True,
                                       as_shadow=request.get('command') == 'shadow')
                else:
                    robot.control(request)
                self.send_json(robot.status())
            else:
                scenario = request.get('scenario', robot.scenario)
                if not isinstance(scenario, str) or scenario not in SCENARIOS:
                    raise ValueError('Choose an available map.')
                if path == '/api/ds/models/import':
                    self.send_json(workspace.import_tree(request.get('content'), request.get('name'), scenario),
                                   HTTPStatus.CREATED)
                    return
                data, dataset = workspace.dataset(request, lambda: robot.manual_csv(scenario), scenario)
                test_data = workspace.packaged_test_data(scenario) if dataset['source'] == 'packaged' else None
                summary = preview_dataset(data, dataset['world'], test_data)
                if path == '/api/ds/preview':
                    self.send_json(summary)
                else:
                    if summary['error']:
                        raise ValueError(summary['error'])
                    self.send_json(workspace.start(data, dataset, test_data), HTTPStatus.ACCEPTED)
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
