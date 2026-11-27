"""Worlds, robots and packaged evaluations available in Navigation Monitor."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_SCENARIO = 'arena'
SCENARIOS = {
    'arena': dict(label='Obstacle Arena', filename='demo.sdf', world='integration_demo',
                  robot='demo_robot', topic='/', goal=(0.67, 0.00, 0.20), model='random_forest',
                  dataset_note='Independent Operator keyboard sessions with live Gazebo corridor checks.'),
    'maze': dict(label='MazeBot Labyrinth', filename='maze.sdf', world='mazebot_maze',
                 robot='mazebot', topic='/maze/', goal=(-4.30, 3.0, 0.16), model='random_forest',
                 auto_duration=90.0,
                 dataset_note='Independent Operator keyboard sessions with planned turns around MazeBot walls.'),
}


def package_id(scenario):
    return f'packaged-{scenario}'
