#!/usr/bin/env python3
"""Five LiDAR sectors for TurtleBot3, ROS Noetic / Python 3.8.

Run: python3 lidar_features.py
This diagnostic only reads /scan; it does not move the robot or save CSV.
Import extract_features(scan) in subsequent collection/control scripts.
Order: left, front_left, front, front_right, right. Units: metres.
Assumes the scan frame has x forward and y left, as on standard TurtleBot3.
"""
import math

FEATURE_NAMES = ("left", "front_left", "front", "front_right", "right")
SECTOR_CENTERS_DEG = (90, 45, 0, -45, -90)
HALF_WIDTH_DEG = 10.0


def extract_features(scan):
    """Return five sector minima; None means no usable data in a sector.

    Positive infinity is treated as no hit within range_max for this
    Gazebo LiDAR. NaN, negative infinity and out-of-range readings are ignored.
    Consumers must reject samples containing None, never replace them with 0.
    """
    if (not math.isfinite(scan.range_max) or scan.range_max <= 0
            or not math.isfinite(scan.range_min)
            or scan.range_min < 0 or scan.range_min > scan.range_max
            or not math.isfinite(scan.angle_min)
            or not math.isfinite(scan.angle_increment)
            or scan.angle_increment == 0):
        return [None] * len(FEATURE_NAMES)

    sectors = [[] for _ in FEATURE_NAMES]
    centers = [math.radians(x) for x in SECTOR_CENTERS_DEG]
    width = math.radians(HALF_WIDTH_DEG)
    for index, distance in enumerate(scan.ranges):
        if distance == float("inf"):
            distance = scan.range_max
        elif not math.isfinite(distance):
            continue
        if not scan.range_min <= distance <= scan.range_max:
            continue
        angle = scan.angle_min + index * scan.angle_increment
        for sector, center in zip(sectors, centers):
            difference = math.atan2(math.sin(angle-center), math.cos(angle-center))
            if abs(difference) <= width + 1e-12:
                sector.append(distance)
    return [min(sector) if sector else None for sector in sectors]


def main():
    import time
    import rospy
    from sensor_msgs.msg import LaserScan

    rospy.init_node("lidar_features_check", anonymous=True)
    state = {"last_received": None, "last_printed": -float("inf")}
    labels = ("Trai", "Truoc-trai", "Truoc", "Truoc-phai", "Phai")

    def callback(scan):
        now = time.monotonic()
        state["last_received"] = now
        if now - state["last_printed"] < 1.0:
            return
        state["last_printed"] = now
        values = extract_features(scan)
        output = []
        for label, value in zip(labels, values):
            display = "KHONG HOP LE" if value is None else "{:.2f} m".format(value)
            output.append("{}: {}".format(label, display))
        print(" | ".join(output), flush=True)

    rospy.Subscriber("/scan", LaserScan, callback, queue_size=1)
    print("Dang doc /scan. Ctrl+C de dung. Khong dieu khien robot.", flush=True)
    started = time.monotonic()
    last_warning = started
    try:
        while not rospy.is_shutdown():
            now = time.monotonic()
            last = state["last_received"]
            if now - (started if last is None else last) > 5 and now - last_warning > 5:
                print("Chua co du lieu moi: kiem tra Gazebo dang chay va khong Pause.", flush=True)
                last_warning = now
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
