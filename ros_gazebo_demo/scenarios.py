"""Worlds, robots and packaged evaluations available in Navigation Monitor."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_SCENARIO = 'arena'
SCENARIOS = {
    'arena': dict(label='Obstacle Arena', filename='demo.sdf', world='integration_demo',
                  robot='demo_robot', topic='/', goal=(0.67, 0.00, 0.20), model='decision_tree',
                  dataset_note='Operator keyboard sessions with live Gazebo telemetry.'),
    'maze': dict(label='MazeBot Labyrinth', filename='maze.sdf', world='mazebot_maze',
                 robot='mazebot', topic='/maze/', goal=(-4.30, 3.0, 0.16), model='decision_tree',
                 dataset_note='Operator keyboard sessions with live Gazebo telemetry.'),
}


def package_id(scenario):
    return f'packaged-{scenario}'
