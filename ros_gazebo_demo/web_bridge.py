"""Connect the Navigation Monitor to the ROS 2 robot."""

import argparse
from collections import deque
import csv
from datetime import datetime, timezone
import io
import math
import threading
import time
from uuid import uuid4
from xml.etree import ElementTree

import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from ros_gz_interfaces.msg import Contacts
from ros_gz_interfaces.srv import ControlWorld
from sensor_msgs.msg import LaserScan

from ds_workspace import MODEL_LABELS, ROOT, Workspace
from inputs.lidar_features import FEATURE_NAMES, extract_features
from inputs.portable_model import rule_path
from inputs.train_models import BEFORE_COMMAND, NAVIGATION_ACTIONS, NAVIGATION_FEATURES
from monitor_http import DATA_FIELDS, MonitorServer, REFERENCE, RUNS
from navigation_history import NavigationHistory
from scenarios import DEFAULT_SCENARIO, SCENARIOS, package_id


SCAN_TIMEOUT = 0.8
MAX_ODOM_SCAN_SKEW = 0.20
MANUAL_DURATION = 0.55
MANUAL_SAMPLE_PERIOD = 0.30
RUN_DURATION = {'manual': 120.0, 'auto': 60.0}
MIN_CLEARANCE = 0.38
ARENA_MARGIN = 0.30
RESET_TIMEOUT = 5.0
MANUAL_WAITING = 'Manual run · waiting for input'
STOP_REASONS = {
    'goal_reached': 'Destination reached',
    'collision': 'Collision detected by Gazebo',
    'operator_stop': 'Stopped by operator',
    'timeout': 'Run time limit reached',
    'telemetry_lost': 'ROS telemetry lost',
    'timestamp_skew': 'LiDAR and odometry timestamps are out of sync',
    'inference_error': 'Model inference failed',
    'arena_edge': 'Robot reached the edge of the map',
    'lidar_clearance': 'Forward command blocked by LiDAR clearance',
    'shutdown': 'Server shutting down',
    'session_reset': 'Session reset by operator',
}


def arena_map(scenario):
    world = ElementTree.parse(ROOT / scenario['filename']).getroot().find('world')
    geometry = world.find("model[@name='arena']/link")
    shapes = {}
    for box in geometry.findall('collision'):
        x, y, *_ = map(float, box.findtext('pose').split())
        w, h, _ = map(float, box.findtext('geometry/box/size').split())
        shapes[box.attrib['name']] = [x - w / 2, y - h / 2, w, h]
    x, y, w, h = shapes.pop('floor')
    return dict(name=world.attrib['name'], label=scenario['label'], robot=scenario['robot'], min_x=x, min_y=y, w=w, h=h,
                obstacles=[[bx - x, by - y, bw, bh] for bx, by, bw, bh in shapes.values()])


def goal_offset(pose, goal):
    dx, dy = goal['x'] - pose['x'], goal['y'] - pose['y']
    angle = math.atan2(dy, dx) - pose['heading']
    return math.hypot(dx, dy), math.atan2(math.sin(angle), math.cos(angle))


def inside_arena(arena, x, y, margin):
    return margin < x < arena['w'] - margin and margin < y < arena['h'] - margin


def encode_manual_csv(rows):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(DATA_FIELDS)
    writer.writerows(rows)
    return output.getvalue().encode('utf-8')


def model_decision(model, features):
    started = time.perf_counter()
    action = str(model.predict([features])[0])
    if action not in NAVIGATION_ACTIONS:
        raise ValueError(f'Unknown predicted action {action}')
    latency = (time.perf_counter() - started) * 1000
    confidence = float(model.predict_proba([features])[0][list(model.classes_).index(action)])
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError('Model returned an invalid probability.')
    return action, confidence, latency


class Monitor(Node):
    adapter = 'ROS 2 · Gazebo'

    def __init__(self, key, scenario, history, workspace):
        super().__init__(f'navigation_web_{key}')
        self.lock = threading.Lock()
        self.map = arena_map(scenario)
        x, y, radius = scenario['goal']
        self.goal = dict(x=x, y=y, radius=radius)
        self.history = history
        self.workspace = workspace
        self.robot_name = scenario['robot']
        self.navigation_run = None
        self.trace_log = None
        self.final_run = None
        self.last_inference = None
        self.last_navigation_id = None
        self.last_navigation_status = None
        self.navigation_save_error = None
        self.active_run = None
        self.active_model = None
        self.active_dataset_sha256 = None
        self.feature_medians = None
        self.model = None
        self.shadow = None
        preset_model = scenario['model']
        try:
            bundle = workspace.load_model(package_id(key), preset_model)
        except FileNotFoundError:
            pass
        else:
            self.active_run = package_id(key)
            self.active_model = preset_model
            self.model = bundle['model']
            self.active_dataset_sha256 = bundle['dataset_sha256']
            self.feature_medians = bundle.get('feature_medians')
        self.mode = 'idle'
        self.reason = 'Waiting for ROS telemetry'
        self.goal_reached = False
        self.deadline = 0.0
        self.command = 'stop'
        self.prediction = None
        self.manual_action = None
        self.manual_deadline = 0.0
        self.started = None
        self.elapsed = 0.0
        self.scan = None
        self.pose = None
        self.pose_at = 0.0
        self.pose_stamp = None
        self.trail = deque(maxlen=400)
        self.traveled = 0.0
        self.reset_future = None
        self.reset_error = None
        self.reset_client = self.create_client(ControlWorld, f"/world/{self.map['name']}/control")
        self.begin_recording()
        topic = scenario['topic']
        self.publisher = self.create_publisher(Twist, topic + 'cmd_vel', 10)
        self.create_subscription(LaserScan, topic + 'scan', self.receive_scan, qos_profile_sensor_data)
        self.create_subscription(Odometry, topic + 'odom', self.receive_odom, qos_profile_sensor_data)
        self.contact_subscription = self.create_subscription(Contacts, topic + 'contacts', self.receive_contacts, 10)
        self.create_timer(0.1, self.step)

    def begin_recording(self):
        self.session = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        self.recorded = []
        self.last_recorded_stamp = -1.0
        self.manual_sample_pending = False
        self.arrival_label_run = None

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
        stamp = msg.header.stamp
        with self.lock:
            if self.navigation_run is not None and self.pose is not None:
                self.navigation_run['distance_m'] += math.hypot(p.x - self.pose['x'], p.y - self.pose['y'])
            self.pose, self.pose_at = pose, time.monotonic()
            self.pose_stamp = stamp.sec + stamp.nanosec * 1e-9
            if not self.trail:
                self.trail.append([p.x, p.y])
            else:
                x, y = self.trail[-1]
                distance = math.hypot(p.x - x, p.y - y)
                if distance >= 0.015:
                    self.trail.append([p.x, p.y])
                    self.traveled += distance

    def receive_contacts(self, message):
        with self.lock:
            run = self.navigation_run
            if run is None:
                return
            stamp = message.header.stamp.sec + message.header.stamp.nanosec * 1e-9
            if stamp and stamp < run['start_scan_stamp']:
                return
            objects = set()
            for contact in message.contacts:
                first = contact.collision1.name
                second = contact.collision2.name
                first_is_robot = self.robot_name in first.split('::')
                second_is_robot = self.robot_name in second.split('::')
                if first_is_robot == second_is_robot:
                    continue
                other = second if first_is_robot else first
                if other and not {'floor', 'ground_plane'}.intersection(other.split('::')):
                    objects.add(other)
            if objects:
                self.stop('collision', contact_objects=sorted(objects))

    def ready(self, now):
        return (self.pose is not None and now - self.pose_at <= SCAN_TIMEOUT
                and self.scan is not None and now - self.scan[0] <= SCAN_TIMEOUT
                and all(value is not None for value in self.scan[2])
                and self.publisher.get_subscription_count() > 0)

    def publish(self, action):
        message = Twist()
        message.linear.x, message.angular.z = NAVIGATION_ACTIONS[action]
        self.publisher.publish(message)
        self.command = action

    def stop(self, outcome, *, contact_objects=(), send_stop=True):
        if self.mode == 'idle':
            return
        try:
            if send_stop:
                self.publish('stop')
        finally:
            self.elapsed = time.monotonic() - self.started
            self.mode = 'idle'
            self.manual_action = None
            self.manual_sample_pending = False
            self.reason = STOP_REASONS[outcome]
            if self.navigation_run is not None:
                self.finish_navigation(outcome, contact_objects)

    def start_navigation(self, mode, started):
        now = datetime.now(timezone.utc)
        self.mode = mode
        self.started = started
        self.deadline = started + RUN_DURATION[mode]
        self.elapsed = 0.0
        self.trail.clear()
        self.trail.append([self.pose['x'], self.pose['y']])
        self.traveled = 0.0
        self.goal_reached = False
        self.arrival_label_run = None
        self.last_navigation_status = None
        self.prediction = None
        self.last_inference = None
        self.final_run = None
        self.reason = 'Autonomous run' if mode == 'auto' else MANUAL_WAITING
        self.navigation_run = dict(
            id=now.strftime('%Y%m%d_%H%M%S_%f_') + uuid4().hex[:6],
            world=self.map['name'], drive_mode=mode, session_id=self.session,
            model=self.active_model if mode == 'auto' else None,
            model_label=MODEL_LABELS[self.active_model] if mode == 'auto' else None,
            model_run_id=self.active_run if mode == 'auto' else None,
            model_dataset_sha256=self.active_dataset_sha256 if mode == 'auto' else None,
            started_at=now.isoformat(), start_x=self.pose['x'], start_y=self.pose['y'],
            start_heading_rad=self.pose['heading'], goal_x=self.goal['x'], goal_y=self.goal['y'],
            goal_radius_m=self.goal['radius'], start_scan_stamp=self.scan[1],
            contact_monitored=self.contact_subscription.get_publisher_count() > 0,
            distance_m=0.0, prediction_count=0, inference_ms=0.0, comparison_eligible=True,
            initial_goal_distance=goal_offset(self.pose, self.goal)[0],
        )
        self.trace_log = dict(id=self.navigation_run['id'], world=self.map['name'],
                              session_id=self.session, rows=[], events=deque(maxlen=250))
        self.log_event(self.reason, started)

    def log_event(self, message, now):
        if self.trace_log is not None:
            self.trace_log['events'].append(dict(elapsed_s=max(0, now - self.started), message=message))

    def record_cycle(self, stamp, features, action, command, now, confidence, inference_ms, shadow):
        automatic = self.mode == 'auto'
        count = len(self.trace_log['rows']) + 1
        row = dict(run_id=self.trace_log['id'], cycle=count, elapsed_s=now - self.started,
                   scan_time=stamp, drive_mode=self.mode, model_run_id=self.active_run if automatic else None,
                   model=self.active_model if automatic else None,
                   model_dataset_sha256=self.active_dataset_sha256 if automatic else None,
                   model_action=action if automatic else None,
                   operator_action=action if not automatic else None, command=command, confidence=confidence,
                   inference_ms=inference_ms, shadow_run_id=None, shadow_model=None, shadow_dataset_sha256=None, shadow_action=None,
                   shadow_confidence=None, shadow_inference_ms=None, expert_action=None,
                   goal_x=self.goal['x'], goal_y=self.goal['y'], **dict(zip(NAVIGATION_FEATURES, features)))
        if shadow is not None:
            run_id, model_name, _, digest = self.shadow
            row.update(shadow_run_id=run_id, shadow_model=model_name, shadow_action=shadow[0],
                       shadow_dataset_sha256=digest, shadow_confidence=shadow[1], shadow_inference_ms=shadow[2])
        self.trace_log['rows'].append(row)
        if automatic:
            self.last_inference = (row, self.model, self.feature_medians)

    def trace(self, run_id):
        with self.lock:
            if self.trace_log is None or run_id not in (None, self.trace_log['id']):
                return None
            return {**self.trace_log, 'rows': self.trace_log['rows'].copy(),
                    'events': list(self.trace_log['events']), 'active': self.navigation_run is not None}

    def explain(self):
        with self.lock:
            sample = self.last_inference
        if sample is None:
            return None
        row, model, reference = sample
        if reference is None:
            return None
        features = [row[name] for name in NAVIGATION_FEATURES]
        alternatives = [features[:i] + [value] + features[i + 1:] for i, value in enumerate(reference)]
        index = list(model.classes_).index(row['model_action'])
        probabilities = model.predict_proba(alternatives)[:, index]
        return dict(run_id=row['run_id'], cycle=row['cycle'], action=row['model_action'], rule_path=rule_path(model, features),
                    confidence=row['confidence'], model=row['model'],
                    features=[dict(name=name, value=value, reference=median, delta=row['confidence'] - float(other))
                              for name, value, median, other in zip(NAVIGATION_FEATURES, features, reference, probabilities)])

    def set_goal(self, x, y):
        if any(type(value) not in (int, float) or (isinstance(value, float) and not math.isfinite(value))
               for value in (x, y)):
            raise ValueError('Goal coordinates must be finite numbers.')
        radius = self.goal['radius']
        margin = max(radius, ARENA_MARGIN)
        min_x, min_y = self.map['min_x'], self.map['min_y']
        if not (min_x + margin < x < min_x + self.map['w'] - margin
                and min_y + margin < y < min_y + self.map['h'] - margin):
            raise ValueError('Choose a goal inside the arena with clearance from the walls.')
        local_x, local_y = x - min_x, y - min_y
        for bx, by, width, height in self.map['obstacles']:
            nearest_x = min(max(local_x, bx), bx + width)
            nearest_y = min(max(local_y, by), by + height)
            if math.hypot(local_x - nearest_x, local_y - nearest_y) <= radius:
                raise ValueError('Choose a goal with space for the arrival circle outside obstacles.')
        if self.navigation_run is not None and (x, y) == (self.goal['x'], self.goal['y']):
            return
        self.goal = dict(x=x, y=y, radius=radius)
        self.arrival_label_run = None
        self.goal_reached = False
        self.last_navigation_status = None
        self.prediction = None
        self.last_inference = None
        self.reason = 'New goal selected'
        if self.navigation_run is not None:
            self.navigation_run.update(goal_x=x, goal_y=y, comparison_eligible=False,
                                       initial_goal_distance=goal_offset(self.pose, self.goal)[0])
            self.log_event(f'Goal changed to ({x:.2f}, {y:.2f}).', time.monotonic())
        else:
            self.final_run = None

    def finish_navigation(self, outcome, contact_objects):
        run, self.navigation_run = self.navigation_run, None
        run.pop('start_scan_stamp')
        monitored = run.pop('contact_monitored')
        inference_ms = run.pop('inference_ms')
        count = run['prediction_count']
        status = 'reached' if outcome == 'goal_reached' else 'terminated'
        self.log_event(STOP_REASONS[outcome], self.started + self.elapsed)
        trace = {**self.trace_log, 'events': list(self.trace_log['events']), 'active': False}
        run.update(
            ended_at=datetime.now(timezone.utc).isoformat(), status=status, end_reason=outcome,
            reason=self.reason, elapsed_s=self.elapsed, goal_distance_m=goal_offset(self.pose, self.goal)[0],
            mean_inference_ms=inference_ms / count if count else None,
            collision=True if contact_objects else False if monitored else None,
            contact_objects=list(contact_objects), cycle_count=len(trace['rows']),
        )
        self.final_run = run
        self.last_navigation_status = status
        try:
            self.history.save(run, trace)
        except OSError as error:
            self.navigation_save_error = f"Could not save navigation run {run['id']}."
            self.get_logger().error(f'{self.navigation_save_error} {error}')
        else:
            self.last_navigation_id = run['id']
            self.navigation_save_error = None

    def reset_session(self, now):
        if self.reset_future is not None:
            raise RuntimeError('The simulator is already resetting.')
        if not self.reset_client.service_is_ready():
            raise RuntimeError('Gazebo reset service is unavailable.')
        if self.recorded:
            try:
                self.workspace.save_session(self.session, encode_manual_csv(self.recorded))
            except OSError as error:
                self.get_logger().error(f'Could not save session {self.session}: {error}')
                raise RuntimeError('Could not save the current CSV. The session was kept.') from error
        self.stop('session_reset')
        request = ControlWorld.Request()
        request.world_control.reset.all = True
        previous_stamp = max(self.scan[1] if self.scan else 0.0, self.pose_stamp or 0.0)
        self.reset_max_stamp = max(0.30, min(2.0, previous_stamp - 0.05))
        self.reset_started_at = now
        self.reset_error = None
        self.reset_future = self.reset_client.call_async(request)
        self.reason = 'Resetting simulator'

    def update_reset(self, now):
        future = self.reset_future
        if future.done():
            try:
                response = future.result()
            except Exception as error:
                self.get_logger().error(f'Gazebo reset service failed: {error}')
                response = None
            if response is None or not response.success:
                self.reset_error = 'Gazebo reset failed. Try Reset session again.'
            elif (self.ready(now) and min(self.scan[0], self.pose_at) > self.reset_started_at
                  and max(self.scan[1], self.pose_stamp) < self.reset_max_stamp
                  and abs(self.scan[1] - self.pose_stamp) <= MAX_ODOM_SCAN_SKEW):
                self.begin_recording()
                self.trail.clear()
                self.trail.append([self.pose['x'], self.pose['y']])
                self.traveled = 0.0
                self.prediction = None
                self.last_inference = None
                self.final_run = None
                self.trace_log = None
                self.manual_action = None
                self.elapsed = 0.0
                self.goal_reached = False
                self.last_navigation_id = None
                self.last_navigation_status = None
                self.navigation_save_error = None
                self.reason = 'Ready'
                self.reset_future = None
                return
        if not self.reset_error and now - self.reset_started_at > RESET_TIMEOUT:
            self.reset_error = 'Gazebo reset timed out. Try Reset session again.'
        if self.reset_error:
            if not future.done():
                future.cancel()
            self.reason = self.reset_error
            self.reset_future = None

    def pause_manual(self, reason):
        self.publish('stop')
        self.manual_action = None
        self.manual_sample_pending = False
        self.reason = reason

    def record_decision(self, stamp, features, action, run_id):
        if stamp > self.last_recorded_stamp:
            self.recorded.append([self.session, self.map['name'], stamp, time.time(), *features, action,
                                  *NAVIGATION_ACTIONS[action], BEFORE_COMMAND,
                                  run_id, self.goal['x'], self.goal['y'], 'operator'])
            self.last_recorded_stamp = stamp

    def step(self):
        with self.lock:
            now = time.monotonic()
            if self.reset_future is not None:
                self.update_reset(now)
                return
            if self.mode == 'idle':
                if self.reason == 'Waiting for ROS telemetry' and self.ready(now):
                    self.reason = 'Ready'
                return
            if not self.ready(now):
                self.stop('telemetry_lost')
                return

            stamp, lidar = self.scan[1:3]
            distance, angle = goal_offset(self.pose, self.goal)
            aligned = abs(stamp - self.pose_stamp) <= MAX_ODOM_SCAN_SKEW
            features = [*lidar, self.pose['v'], self.pose['w'], distance, angle]
            self.navigation_run['contact_monitored'] &= self.contact_subscription.get_publisher_count() > 0
            if distance <= self.goal['radius']:
                if self.mode == 'manual':
                    self.arrival_label_run = self.navigation_run['id']
                self.goal_reached = True
                self.stop('goal_reached')
                return
            if now >= self.deadline:
                self.stop('timeout')
                return
            confidence = inference_ms = shadow = None
            if self.mode == 'auto':
                if not aligned:
                    self.stop('timestamp_skew')
                    return
                try:
                    action, confidence, inference_ms = model_decision(self.model, features)
                except Exception as error:
                    self.get_logger().error(f'Model inference failed: {error}')
                    self.stop('inference_error')
                    return
                self.prediction = action
                self.navigation_run['prediction_count'] += 1
                self.navigation_run['inference_ms'] += inference_ms
                if self.shadow is not None:
                    try:
                        shadow = model_decision(self.shadow[2], features)
                    except Exception as error:
                        self.get_logger().error(f'Shadow inference failed: {error}')
                        self.log_event('Shadow inference failed. Active model continues.', now)
                        self.shadow = None
            else:
                action = self.manual_action
                if action is None:
                    return
                if now >= self.manual_deadline:
                    self.pause_manual(MANUAL_WAITING)
                    return

            x = self.pose['x'] - self.map['min_x']
            y = self.pose['y'] - self.map['min_y']
            blocked = None
            moving = action == 'forward' or (self.mode == 'auto' and action != 'stop')
            if moving and not inside_arena(self.map, x, y, ARENA_MARGIN):
                blocked = 'arena_edge'
            if action == 'forward' and min(lidar[1:4]) < MIN_CLEARANCE:
                blocked = blocked or 'lidar_clearance'
            if blocked:
                if self.mode == 'manual':
                    self.pause_manual(STOP_REASONS[blocked])
                    if aligned:
                        self.record_cycle(stamp, features, action, 'stop', now, None, None, None)
                    self.log_event(STOP_REASONS[blocked], now)
                else:
                    self.record_cycle(stamp, features, action, 'stop', now, confidence, inference_ms, shadow)
                    self.stop(blocked)
                return

            if self.mode == 'manual':
                if self.manual_sample_pending and (not aligned or stamp <= self.last_recorded_stamp):
                    if action == 'stop':
                        self.publish('stop')
                    return
                if aligned and (self.manual_sample_pending
                                or stamp >= self.last_recorded_stamp + MANUAL_SAMPLE_PERIOD - 1e-6):
                    self.record_decision(stamp, features, action, self.navigation_run['id'])
                    self.manual_sample_pending = False
            if aligned:
                self.record_cycle(stamp, features, action, action, now, confidence, inference_ms, shadow)
            self.publish(action)

    def select_model(self, run_id, model, bundle, *, hot_swap=False, as_shadow=False):
        with self.lock:
            if self.reset_future is not None:
                raise RuntimeError('Wait for the simulator to finish resetting.')
            if as_shadow:
                self.shadow = (run_id, model, bundle['model'], bundle['dataset_sha256'])
                if self.navigation_run is not None:
                    self.log_event(f'Shadow B: {MODEL_LABELS[model]} · {run_id}.', time.monotonic())
                return
            if self.mode != 'idle' and not (hot_swap and self.mode == 'auto'):
                raise RuntimeError('Stop the robot before selecting a model')
            if (self.active_run, self.active_model, self.active_dataset_sha256) == (run_id, model, bundle['dataset_sha256']):
                return
            self.active_run = run_id
            self.active_model = model
            self.model = bundle['model']
            self.active_dataset_sha256 = bundle['dataset_sha256']
            self.feature_medians = bundle.get('feature_medians')
            self.prediction = None
            self.last_inference = None
            self.reason = f'{MODEL_LABELS[model]} selected'
            if self.navigation_run is not None:
                self.navigation_run['comparison_eligible'] = False
                self.log_event(f'Active model changed to {MODEL_LABELS[model]} · {run_id}.', time.monotonic())

    def control(self, request):
        command = request.get('command')
        with self.lock:
            now = time.monotonic()
            if command == 'reset':
                self.reset_session(now)
                return
            if command == 'stop':
                self.stop('operator_stop')
                return
            if command == 'clear_shadow':
                self.shadow = None
                if self.navigation_run is not None:
                    self.log_event('Shadow B cleared.', now)
                return
            if command == 'observation':
                if type(request.get('paused')) is not bool:
                    raise ValueError('Choose pause or resume for observation.')
                if self.navigation_run is not None:
                    self.log_event('Observation paused.' if request['paused'] else 'Observation resumed.', now)
                return
            if command == 'console_event':
                text = request.get('text')
                if not isinstance(text, str) or not 1 <= len(text) <= 100 or not text.isprintable():
                    raise ValueError('Invalid console event.')
                if self.navigation_run is not None:
                    self.log_event(f'Console: {text}', now)
                return
            if command == 'release_manual':
                if self.mode == 'manual' and self.manual_action == request.get('action'):
                    self.pause_manual(MANUAL_WAITING)
                return
            if command not in ('start', 'start_manual', 'manual', 'set_goal'):
                raise ValueError('Unknown command')
            action = request.get('action')
            if command == 'manual' and (not isinstance(action, str) or action not in NAVIGATION_ACTIONS):
                raise ValueError('Unknown manual action')
            if self.reset_future is not None or self.reset_error:
                raise RuntimeError('The simulator must finish resetting before it can move.')
            if not self.ready(now):
                raise RuntimeError('Waiting for fresh LiDAR, odometry and command bridge')
            if command == 'manual':
                if action == 'stop' and self.arrival_label_run is not None:
                    stamp, lidar = self.scan[1:3]
                    distance, angle = goal_offset(self.pose, self.goal)
                    if (distance > self.goal['radius'] or abs(stamp - self.pose_stamp) > MAX_ODOM_SCAN_SKEW
                            or stamp <= self.last_recorded_stamp):
                        raise RuntimeError('Wait for a fresh LiDAR and odometry sample inside the goal.')
                    features = [*lidar, self.pose['v'], self.pose['w'], distance, angle]
                    self.record_decision(stamp, features, 'stop', self.arrival_label_run)
                    self.arrival_label_run = None
                    return
                if self.mode != 'manual':
                    raise RuntimeError('Start a manual run before driving.')
                if self.manual_action != action:
                    self.manual_sample_pending = True
                self.manual_action = action
                self.manual_deadline = now + MANUAL_DURATION
                self.reason = 'Manual run · recording decisions'
                return
            if command == 'set_goal' and (self.mode == 'idle' or
                                          (self.mode == 'auto' and request.get('retarget') is True)):
                self.set_goal(request.get('x'), request.get('y'))
                return
            if self.mode != 'idle':
                raise RuntimeError('End the current run before starting a run or changing the goal.')
            if command == 'start' and self.model is None:
                raise RuntimeError('Train and select a model for this map first.')
            if goal_offset(self.pose, self.goal)[0] <= self.goal['radius']:
                raise RuntimeError('The robot is already at the goal. Choose a goal for the next run.')
            self.start_navigation('auto' if command == 'start' else 'manual', now)

    def status(self):
        with self.lock:
            now = time.monotonic()
            scan = self.scan if self.scan and now - self.scan[0] <= SCAN_TIMEOUT else None
            pose = self.pose if now - self.pose_at <= SCAN_TIMEOUT else None
            distance, angle = goal_offset(pose, self.goal) if pose else (None, None)
            resetting = self.reset_future is not None
            run = self.navigation_run or self.final_run
            latest = self.last_inference[0] if self.last_inference is not None else None
            summary = ({key: run[key] for key in ('id', 'start_x', 'start_y', 'initial_goal_distance', 'distance_m',
                                                  'comparison_eligible')} if run else None)
            if summary:
                summary.update(cycle_count=len(self.trace_log['rows']), end_reason=run.get('end_reason'))
            return dict(ready=not (resetting or self.reset_error) and self.ready(now),
                        mode=self.mode, reason=self.reason, pose=pose,
                        session_id=self.session, resetting=resetting, reset_available=self.reset_client.service_is_ready(),
                        goal=self.goal, goal_distance=distance, goal_angle=angle, goal_reached=self.goal_reached,
                        record_stop_available=self.arrival_label_run is not None,
                        contact_connected=self.contact_subscription.get_publisher_count() > 0,
                        last_navigation_id=self.last_navigation_id,
                        last_navigation_status=self.last_navigation_status, navigation_save_error=self.navigation_save_error,
                        prediction=self.prediction, command=self.command, active_model=self.active_model,
                        confidence=latest['confidence'] if latest else None,
                        inference_ms=latest['inference_ms'] if latest else None, navigation=summary,
                        shadow=dict(run_id=self.shadow[0], model=self.shadow[1], label=MODEL_LABELS[self.shadow[1]])
                        if self.shadow else None,
                        active_run=self.active_run, active_model_label=MODEL_LABELS.get(self.active_model),
                        sectors=dict(zip(FEATURE_NAMES, scan[2])) if scan else {}, range_max=scan[3] if scan else None,
                        elapsed=now - self.started if self.mode != 'idle' else self.elapsed,
                        traveled=self.traveled, trail=list(self.trail), recorded=len(self.recorded))

    def manual_csv(self):
        with self.lock:
            rows = self.recorded.copy()
        return encode_manual_csv(rows)


class RobotFleet:
    adapter = Monitor.adapter
    live = True

    def __init__(self, monitors):
        self.monitors = monitors
        self.scenario = DEFAULT_SCENARIO
        self.lock = threading.Lock()

    def status(self):
        with self.lock:
            monitor = self.monitors[self.scenario]
            return dict(monitor.status(), scenario=self.scenario, map=monitor.map)

    def manual_csv(self, scenario):
        return self.monitors[scenario].manual_csv()

    def trace(self, scenario, run_id):
        return self.monitors[scenario].trace(run_id)

    def explain(self, scenario):
        return self.monitors[scenario].explain()

    def select_model(self, run_id, model, bundle, *, scenario=None, hot_swap=False, as_shadow=False):
        with self.lock:
            if scenario is not None and scenario != self.scenario:
                raise RuntimeError('The active map changed. Try the command again.')
            monitor = self.monitors[self.scenario]
            if bundle['world'] != monitor.map['name']:
                raise ValueError('Select a model trained on this map.')
            monitor.select_model(run_id, model, bundle, hot_swap=hot_swap, as_shadow=as_shadow)

    def control(self, request):
        with self.lock:
            monitor = self.monitors[self.scenario]
            if request.get('command') == 'select_scenario':
                scenario = request.get('scenario')
                if not isinstance(scenario, str) or scenario not in self.monitors:
                    raise ValueError('Choose an available map.')
                status = monitor.status()
                if status['mode'] != 'idle' or status['resetting']:
                    raise RuntimeError('End the current run and wait for reset before switching maps.')
                self.scenario = scenario
            else:
                if request.get('scenario', self.scenario) != self.scenario:
                    raise RuntimeError('The active map changed. Try the command again.')
                monitor.control(request)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    x, y, radius = SCENARIOS[DEFAULT_SCENARIO]['goal']
    parser.add_argument('--goal-x', type=float, default=x, help='Destination x in the Arena odometry frame, in metres.')
    parser.add_argument('--goal-y', type=float, default=y, help='Destination y in the Arena odometry frame, in metres.')
    parser.add_argument('--goal-radius', type=float, default=radius, help='Arena arrival radius in metres.')
    parser.add_argument('--robot-name', default='demo_robot', help='Gazebo model name in the scoped contact entities.')
    args = parser.parse_args()
    goal = dict(x=args.goal_x, y=args.goal_y, radius=args.goal_radius)
    if not all(math.isfinite(value) for value in goal.values()) or goal['radius'] <= 0:
        parser.error('The goal coordinates must be finite and the arrival radius must be positive.')
    workspace = Workspace(REFERENCE, RUNS)
    history = NavigationHistory(workspace.runs_dir / 'navigation')
    rclpy.init()
    scenarios = {**SCENARIOS, 'arena': {**SCENARIOS['arena'], 'robot': args.robot_name,
                                      'goal': (args.goal_x, args.goal_y, args.goal_radius)}}
    monitors = {key: Monitor(key, scenario, history, workspace) for key, scenario in scenarios.items()}
    executor = SingleThreadedExecutor()
    for node in monitors.values():
        executor.add_node(node)
    with MonitorServer((args.host, args.port), RobotFleet(monitors), workspace, history) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f'Navigation Monitor listening on {args.host}:{args.port}', flush=True)
        try:
            executor.spin()
        except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
            pass
        finally:
            for node in monitors.values():
                with node.lock:
                    node.stop('shutdown', send_stop=rclpy.ok())
            server.shutdown()
            thread.join()
            executor.shutdown()
            for node in monitors.values():
                node.destroy_node()
            rclpy.try_shutdown()


if __name__ == '__main__':
    main()
