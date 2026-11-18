from pathlib import Path

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, ExecuteProcess, Shutdown
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    directory = Path(__file__).resolve().parent
    world = str(directory / 'demo.sdf')
    headless = LaunchConfiguration('headless')
    return LaunchDescription([
        DeclareLaunchArgument('headless', default_value='true', choices=['true', 'false']),
        DeclareLaunchArgument('web', default_value='false', choices=['true', 'false']),
        DeclareLaunchArgument('web_host', default_value='127.0.0.1'),
        ExecuteProcess(
            cmd=['gz', 'sim', '-r', '-s', '--headless-rendering', world],
            condition=IfCondition(headless),
            output='screen',
            on_exit=Shutdown(reason='Gazebo server exited'),
        ),
        ExecuteProcess(
            cmd=['gz', 'sim', '-r', world],
            condition=UnlessCondition(headless),
            output='screen',
            on_exit=Shutdown(reason='Gazebo exited'),
        ),
        Node(
            package='ros_gz_bridge',
            executable='parameter_bridge',
            parameters=[{'config_file': str(directory / 'bridge.yaml')}],
            output='screen',
            on_exit=Shutdown(reason='ROS–Gazebo bridge exited'),
        ),
        ExecuteProcess(
            cmd=['python3', str(directory / 'web_bridge.py'), '--host', LaunchConfiguration('web_host')],
            condition=IfCondition(LaunchConfiguration('web')),
            output='screen',
            on_exit=Shutdown(reason='Web bridge exited'),
        ),
    ])
