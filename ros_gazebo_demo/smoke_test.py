"""Check that ROS 2 sees the wall and that a velocity message moves the robot."""

import math
import time

import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import LaserScan


class IntegrationCheck(Node):
    def __init__(self):
        super().__init__('gazebo_integration_check')
        self.scan = None
        self.odom = None
        self.create_subscription(LaserScan, '/scan', self.receive_scan, qos_profile_sensor_data)
        self.create_subscription(Odometry, '/odom', self.receive_odom, qos_profile_sensor_data)
        self.publisher = self.create_publisher(Twist, '/cmd_vel', 10)

    def receive_scan(self, message):
        self.scan = message

    def receive_odom(self, message):
        self.odom = message

    def wait_for(self, condition, timeout, description, command=None):
        deadline = time.monotonic() + timeout
        while rclpy.ok() and time.monotonic() < deadline:
            if condition():
                return
            if command is not None:
                self.publisher.publish(command)
            rclpy.spin_once(self, timeout_sec=0.05)
            time.sleep(0.02)
        raise RuntimeError(description)

    def front_distance(self):
        scan = self.scan
        if scan is None or not scan.angle_increment:
            return math.inf
        index = round(-scan.angle_min / scan.angle_increment)
        if 0 <= index < len(scan.ranges):
            distance = scan.ranges[index]
            if scan.range_min <= distance <= scan.range_max:
                return distance
        return math.inf

    def stopped(self):
        twist = self.odom.twist.twist
        return abs(twist.linear.x) < 0.02 and abs(twist.angular.z) < 0.02

    def check(self):
        self.wait_for(lambda: self.scan is not None, 45, 'No LiDAR message on /scan')
        self.wait_for(lambda: self.odom is not None, 5, 'No odometry on /odom')
        self.wait_for(self.publisher.get_subscription_count, 5, 'No bridge subscriber on /cmd_vel')
        self.wait_for(
            lambda: self.stopped() and 1.5 < self.front_distance() < 1.9,
            5,
            'Restart the demo with the robot at its initial pose facing the front wall',
        )
        start_distance = self.front_distance()
        start_x = self.odom.pose.pose.position.x
        forward = Twist()
        forward.linear.x = 0.20
        try:
            self.wait_for(
                lambda: self.odom.pose.pose.position.x - start_x >= 0.15,
                6,
                'Odometry did not show at least 0.15 m of forward movement',
                forward,
            )
            self.publisher.publish(Twist())
            self.wait_for(self.stopped, 5, 'Odometry did not confirm a stop', Twist())
            scan_at_stop = self.scan.header.stamp
            self.wait_for(
                lambda: self.scan.header.stamp != scan_at_stop,
                5,
                'LiDAR stopped publishing after the robot moved',
            )
            end_distance = self.front_distance()
            moved = self.odom.pose.pose.position.x - start_x
            if start_distance - end_distance < 0.10:
                raise RuntimeError('LiDAR did not show the robot getting closer to the wall')
        finally:
            if rclpy.ok():
                self.publisher.publish(Twist())
                rclpy.spin_once(self, timeout_sec=0.1)

        print(f'PASS /scan: {len(self.scan.ranges)} beams, wall {start_distance:.3f} -> {end_distance:.3f} m')
        print(f'PASS /odom: forward displacement {moved:.3f} m')
        print('PASS /cmd_vel: forward command moved the robot and zero command stopped it')


def main():
    rclpy.init()
    node = IntegrationCheck()
    try:
        node.check()
    except RuntimeError as error:
        raise SystemExit(str(error)) from error
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
