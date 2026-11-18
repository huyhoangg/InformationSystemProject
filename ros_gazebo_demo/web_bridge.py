"""Serve the Navigation Monitor and exchange telemetry and commands with ROS 2."""

import argparse
from collections import deque
import csv
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import math
from pathlib import Path
import threading
import time
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

import joblib
import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import LaserScan

from reference.lidar_features import FEATURE_NAMES, HALF_WIDTH_DEG, SECTOR_CENTERS_DEG, extract_features


ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT / 'reference'
MODELS = {'knn': 'KNN', 'decision_tree': 'Decision Tree', 'svm': 'SVM', 'naive_bayes': 'Gaussian Naive Bayes'}
SCAN_TIMEOUT = 0.8
MANUAL_DURATION = 0.55
RUN_DURATION = 60.0
MIN_CLEARANCE = 0.38
DATA_FIELDS = ['session_id', 'world', 'scan_time', 'wall_time', *FEATURE_NAMES, 'action', 'linear_x', 'angular_z']
STATIC_TYPES = {
    'Navigation Monitor.html': 'text/html', 'styles.css': 'text/css',
    **{name: 'text/javascript' for name in ('sim.jsx', 'icons.jsx', 'components.jsx', 'live.jsx', 'app.jsx')},
}


def arena_map():
    world = ElementTree.parse(ROOT / 'demo.sdf').getroot().find('world')
    geometry = world.find("model[@name='arena']/link")
    shapes = {}
    for box in geometry.findall('collision'):
        x, y, *_ = map(float, box.findtext('pose').split())
        w, h, _ = map(float, box.findtext('geometry/box/size').split())
        shapes[box.attrib['name']] = [x - w / 2, y - h / 2, w, h]
    x, y, w, h = shapes.pop('floor')
    return dict(name=world.attrib['name'], min_x=x, min_y=y, w=w, h=h,
                obstacles=[[bx - x, by - y, bw, bh] for bx, by, bw, bh in shapes.values()])


def load_reference():
    results = REFERENCE / 'results'
    manifest = json.loads((results / 'manifest.json').read_text(encoding='utf-8'))
    with (results / 'metrics.csv').open(newline='', encoding='utf-8') as source:
        metrics = list(csv.DictReader(source))
    reports = []
    for row in metrics:
        name = row['model']
        with (results / f'{name}_confusion.csv').open(newline='', encoding='utf-8') as source:
            labels, *matrix = csv.reader(source)
        reports.append(dict(id=name, label=MODELS.get(name, 'Majority baseline'), labels=labels[1:],
                            confusion=[[int(value) for value in line[1:]] for line in matrix],
                            accuracy=float(row['accuracy']), macro_f1=float(row['macro_f1'])))
    return dict(total=manifest['total'], train=manifest['train'], test=manifest['test'], models=reports)


class Monitor(Node):
    def __init__(self):
        super().__init__('navigation_web')
        self.lock = threading.Lock()
        self.bundles = {name: joblib.load(REFERENCE / 'models' / f'{name}.joblib') for name in MODELS}
        self.report = load_reference()
        self.map = arena_map()
        self.active_model = 'knn'
        self.actions = self.bundles[self.active_model]['actions']
        self.mode = 'idle'
        self.reason = 'Waiting for ROS telemetry'
        self.deadline = 0.0
        self.command = 'stop'
        self.prediction = None
        self.manual_action = None
        self.started = None
        self.elapsed = 0.0
        self.scan = None
        self.pose = None
        self.pose_at = 0.0
        self.trail = deque(maxlen=400)
        self.traveled = 0.0
        self.session = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        self.recorded = []
        self.last_recorded_stamp = -1.0
        self.publisher = self.create_publisher(Twist, '/cmd_vel', 10)
        self.create_subscription(LaserScan, '/scan', self.receive_scan, qos_profile_sensor_data)
        self.create_subscription(Odometry, '/odom', self.receive_odom, qos_profile_sensor_data)
        self.create_timer(0.1, self.step)

    def receive_scan(self, msg):
        stamp = msg.header.stamp
        features = extract_features(msg)
        max_range = msg.range_max if math.isfinite(msg.range_max) and msg.range_max > 0 else None
        with self.lock:
            self.scan = (time.monotonic(), stamp.sec + stamp.nanosec * 1e-9, features, max_range)

    def receive_odom(self, msg):
        p, q = msg.pose.pose.position, msg.pose.pose.orientation
        twist = msg.twist.twist
        yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y ** 2 + q.z ** 2))
        pose = dict(x=p.x, y=p.y, heading=yaw, v=twist.linear.x, w=twist.angular.z)
        if not all(math.isfinite(value) for value in pose.values()):
            return
        with self.lock:
            self.pose, self.pose_at = pose, time.monotonic()
            if not self.trail:
                self.trail.append([p.x, p.y])
            else:
                x, y = self.trail[-1]
                distance = math.hypot(p.x - x, p.y - y)
                if distance >= 0.015:
                    self.trail.append([p.x, p.y])
                    self.traveled += distance

    def ready(self, now):
        return (self.pose is not None and now - self.pose_at <= SCAN_TIMEOUT
                and self.scan is not None and now - self.scan[0] <= SCAN_TIMEOUT
                and all(value is not None for value in self.scan[2])
                and self.publisher.get_subscription_count() > 0)

    def publish(self, action):
        message = Twist()
        if action != 'stop':
            message.linear.x, message.angular.z = self.actions[action]
        self.publisher.publish(message)
        self.command = action

    def stop(self, reason):
        if self.mode != 'idle':
            self.publish('stop')
            self.elapsed = time.monotonic() - self.started
        self.mode = 'idle'
        self.reason = reason

    def step(self):
        with self.lock:
            now = time.monotonic()
            if self.mode == 'idle':
                if self.reason == 'Waiting for ROS telemetry' and self.ready(now):
                    self.reason = 'Ready'
                return
            if now >= self.deadline or not self.ready(now):
                self.stop('Command expired' if now >= self.deadline else 'ROS telemetry lost')
                return

            features = self.scan[2]
            if self.mode == 'auto':
                try:
                    action = str(self.bundles[self.active_model]['model'].predict([features])[0])
                    if action not in self.actions:
                        raise ValueError(f'Unknown predicted action {action}')
                except Exception as error:
                    self.get_logger().error(f'Model inference failed: {error}')
                    self.stop('Model inference failed')
                    return
                self.prediction = action
            else:
                action = self.manual_action

            x = self.pose['x'] - self.map['min_x']
            y = self.pose['y'] - self.map['min_y']
            if not (0.30 < x < self.map['w'] - 0.30 and 0.30 < y < self.map['h'] - 0.30):
                self.stop('Robot reached the edge of the demo arena')
                return
            if action == 'forward' and min(features[1:4]) < MIN_CLEARANCE:
                self.stop('Forward command blocked by LiDAR clearance')
                return

            stamp = self.scan[1]
            if self.mode == 'manual' and self.command == action and stamp > self.last_recorded_stamp:
                self.recorded.append([self.session, self.map['name'], stamp, time.time(), *features,
                                      action, *self.actions[action]])
                self.last_recorded_stamp = stamp
            self.publish(action)

    def control(self, request):
        command = request.get('command')
        with self.lock:
            now = time.monotonic()
            if command == 'stop':
                self.stop('Stopped by operator')
                return
            if command == 'model':
                model = request.get('model')
                if not isinstance(model, str) or model not in self.bundles:
                    raise ValueError('Unknown model')
                if self.mode != 'idle':
                    raise RuntimeError('Stop the robot before selecting a model')
                self.active_model = model
                self.prediction = None
                self.reason = f'{MODELS[model]} selected'
                return
            if command not in ('start', 'manual'):
                raise ValueError('Unknown command')
            action = request.get('action')
            if command == 'manual' and (not isinstance(action, str) or action not in self.actions):
                raise ValueError('Unknown manual action')
            if not self.ready(now):
                raise RuntimeError('Waiting for fresh LiDAR, odometry and command bridge')
            if (command == 'start' and self.mode != 'idle') or (command == 'manual' and self.mode == 'auto'):
                raise RuntimeError('Stop the current run before changing modes')
            if self.mode == 'idle':
                self.started = now
                self.elapsed = 0.0
            self.mode = 'auto' if command == 'start' else 'manual'
            self.manual_action = action
            self.deadline = now + (RUN_DURATION if command == 'start' else MANUAL_DURATION)
            self.reason = 'Autonomous run' if command == 'start' else 'Manual session recording'
            self.prediction = None

    def status(self):
        with self.lock:
            now = time.monotonic()
            scan = self.scan if self.scan and now - self.scan[0] <= SCAN_TIMEOUT else None
            pose = self.pose if now - self.pose_at <= SCAN_TIMEOUT else None
            return dict(ready=self.ready(now), mode=self.mode, reason=self.reason, pose=pose,
                        prediction=self.prediction, command=self.command, active_model=self.active_model,
                        sectors=dict(zip(FEATURE_NAMES, scan[2])) if scan else {}, range_max=scan[3] if scan else None,
                        elapsed=now - self.started if self.mode != 'idle' else self.elapsed,
                        traveled=self.traveled, trail=list(self.trail), recorded=len(self.recorded))

    def manual_csv(self):
        with self.lock:
            rows = self.recorded.copy()
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(DATA_FIELDS)
        writer.writerows(rows)
        return output.getvalue().encode('utf-8')


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
        if urlsplit(self.path).path != '/api/status' or str(code) != '200':
            super().log_request(code, size)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        node = self.server.node
        if path == '/':
            self.send_response(HTTPStatus.FOUND)
            self.send_header('Location', '/Navigation%20Monitor.html?live=1')
            self.end_headers()
        elif path == '/api/status':
            self.send_json(node.status())
        elif path == '/api/setup':
            self.send_json(dict(map=node.map, report=node.report,
                                sector_angles=dict(zip(FEATURE_NAMES, SECTOR_CENTERS_DEG)), half_width=HALF_WIDTH_DEG))
        elif path == '/api/dataset/reference.csv':
            self.send_data((REFERENCE / 'dataset.csv').read_bytes(), 'text/csv', filename='reference-driving.csv')
        elif path == '/api/dataset/manual.csv':
            self.send_data(node.manual_csv(), 'text/csv', filename='gazebo-manual-driving.csv')
        elif path[1:] in STATIC_TYPES:
            name = path[1:]
            self.send_data((self.server.web_root / name).read_bytes(), STATIC_TYPES[name])
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path != '/api/control':
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        origin = self.headers.get('Origin')
        if (origin and origin != f'http://{self.headers.get("Host")}') or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.send_json({'error': 'Control requests must come from the monitor origin'}, HTTPStatus.FORBIDDEN)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 1024 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Expected a JSON control request')
            request = json.loads(self.rfile.read(size))
            if not isinstance(request, dict):
                raise ValueError('Expected a JSON object')
            self.server.node.control(request)
        except ValueError as error:
            self.send_json({'error': str(error)}, HTTPStatus.BAD_REQUEST)
        except RuntimeError as error:
            self.send_json({'error': str(error)}, HTTPStatus.CONFLICT)
        else:
            self.send_json(self.server.node.status())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    rclpy.init()
    node = Monitor()
    with ThreadingHTTPServer((args.host, args.port), MonitorRequest) as server:
        server.node = node
        server.web_root = ROOT / 'web' if (ROOT / 'web').is_dir() else ROOT.parent
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        node.get_logger().info(f'Navigation Monitor listening on {args.host}:{args.port}')
        try:
            rclpy.spin(node)
        except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
            pass
        finally:
            if rclpy.ok():
                with node.lock:
                    node.stop('Server shutting down')
            server.shutdown()
            thread.join()
            node.destroy_node()
            rclpy.try_shutdown()


if __name__ == '__main__':
    main()
