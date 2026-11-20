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
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='.training-', dir=output.parent) as temporary:
        reference = Path(temporary) / 'reference'
        reference.mkdir()
        dataset = reference / 'dataset.csv'
        copyfile(INPUTS / 'dataset.csv', dataset)
        subprocess.run([sys.executable, str(INPUTS / 'train_models.py'), '--data', str(dataset),
                        '--output', str(reference)], check=True)
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
