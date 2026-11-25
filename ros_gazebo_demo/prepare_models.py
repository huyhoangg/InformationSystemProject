"""Build the packaged evaluation and models for each available world."""

import argparse
import hashlib
import json
import os
from pathlib import Path
from shutil import copy2
import subprocess
import sys
from tempfile import TemporaryDirectory

import sklearn

from scenarios import ROOT, SCENARIOS


def package_is_current(directory, source, test_source):
    manifest_path = directory / 'results' / 'manifest.json'
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return False
    return (manifest.get('sha256') == hashlib.sha256(source.read_bytes()).hexdigest()
            and manifest.get('test_sha256') == (hashlib.sha256(test_source.read_bytes()).hexdigest()
                                                if test_source.is_file() else None)
            and manifest.get('sklearn_version') == sklearn.__version__)


def prepare(output):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for key in SCENARIOS:
        source = ROOT / 'data' / f'{key}.csv'
        test_source = ROOT / 'data' / f'{key}_test.csv'
        destination = output / key
        if not source.is_file() or package_is_current(destination, source, test_source):
            continue
        with TemporaryDirectory(prefix='.training-', dir=output) as temporary:
            package = Path(temporary) / key
            package.mkdir()
            dataset = package / 'dataset.csv'
            copy2(source, dataset)
            command = [sys.executable, str(ROOT / 'inputs' / 'train_models.py'), '--data', str(dataset),
                       '--output', str(package)]
            if test_source.is_file():
                test = package / 'test_dataset.csv'
                copy2(test_source, test)
                command.extend(('--test-data', str(test)))
            subprocess.run(command, check=True)
            previous = Path(temporary) / 'previous'
            if destination.exists():
                os.replace(destination, previous)
            try:
                os.replace(package, destination)
            except OSError:
                if previous.exists():
                    os.replace(previous, destination)
                raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', default=ROOT / 'reference', type=Path)
    args = parser.parse_args()
    prepare(args.output)


if __name__ == '__main__':
    main()
