"""Train demo models from the sample driving session."""

import argparse
import os
from pathlib import Path
from shutil import copyfile
import subprocess
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parent
INPUTS = ROOT / 'inputs'


def prepare(output):
    output = output.resolve()
    with TemporaryDirectory(prefix='.training-', dir=output.parent) as temporary:
        work = Path(temporary)
        reference = work / 'reference'
        reference.mkdir()
        trainer = work / 'train_models.py'
        dataset = reference / 'dataset.csv'
        copyfile(INPUTS / 'train_models.py', trainer)
        copyfile(INPUTS / 'dataset.csv', dataset)
        copyfile(INPUTS / 'lidar_features.py', reference / 'lidar_features.py')

        subprocess.run([sys.executable, str(trainer), '--data', str(dataset)], check=True)
        next((work / 'models').iterdir()).rename(reference / 'models')
        next((work / 'results').iterdir()).rename(reference / 'results')
        os.replace(reference, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', default=ROOT / 'reference', type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f'Output already exists: {args.output}')
    prepare(args.output)


if __name__ == '__main__':
    main()
