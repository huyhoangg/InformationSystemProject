"""Portable Decision Tree bundles use only bounded JSON data and numeric inference."""

import json
import math

import numpy as np

from .lidar_features import HALF_WIDTH_DEG, SECTOR_CENTERS_DEG
from .train_models import NAVIGATION_ACTIONS, NAVIGATION_FEATURES


FORMAT = 'navigation-decision-tree-v1'
MAX_MODEL_BYTES = 256 * 1024


def finite(value):
    return type(value) in (int, float) and abs(value) <= 1e9 and math.isfinite(value)


class PortableTree:
    def __init__(self, payload, world):
        if (not isinstance(payload, dict) or payload.get('format') != FORMAT
                or payload.get('world') != world or payload.get('features') != NAVIGATION_FEATURES
                or payload.get('actions') != NAVIGATION_ACTIONS
                or payload.get('sectors') != list(SECTOR_CENTERS_DEG)
                or payload.get('half_width') != HALF_WIDTH_DEG):
            raise ValueError('Choose a Decision Tree JSON bundle exported for the selected map.')
        classes = payload.get('classes')
        if not isinstance(classes, list) or any(not isinstance(label, str) for label in classes):
            raise ValueError('Invalid model classes.')
        if sorted(classes) != sorted(NAVIGATION_ACTIONS):
            raise ValueError('The model must contain all four navigation actions.')
        nodes = payload.get('nodes')
        if not isinstance(nodes, list) or not 1 <= len(nodes) <= 1024:
            raise ValueError('Decision Tree bundle must contain 1 to 1024 nodes.')
        medians = payload.get('feature_medians')
        if medians is not None and (not isinstance(medians, list) or len(medians) != len(NAVIGATION_FEATURES)
                                    or not all(finite(value) for value in medians)):
            raise ValueError('Invalid reference values for the Decision Tree.')
        visited = set()

        def validate(index, depth):
            if type(index) is not int or not 0 <= index < len(nodes) or index in visited or depth > 32:
                raise ValueError('Decision Tree contains an invalid branch.')
            visited.add(index)
            node = nodes[index]
            if not isinstance(node, list):
                raise ValueError('Invalid Decision Tree node.')
            if len(node) == 1:
                values = node[0]
                if (not isinstance(values, list) or len(values) != len(classes)
                        or not all(finite(value) and 0 <= value <= 1 for value in values)
                        or not math.isclose(sum(values), 1, abs_tol=1e-7)):
                    raise ValueError('Invalid Decision Tree leaf probabilities.')
                return
            if (len(node) != 4 or type(node[0]) is not int or not 0 <= node[0] < len(NAVIGATION_FEATURES)
                    or not finite(node[1])):
                raise ValueError('Invalid Decision Tree split.')
            validate(node[2], depth + 1)
            validate(node[3], depth + 1)

        validate(0, 0)
        if len(visited) != len(nodes):
            raise ValueError('Decision Tree contains unreachable nodes.')
        self.classes_ = np.asarray(classes)
        self.nodes = nodes
        self.feature_medians = medians

    def predict_proba(self, X):
        probabilities = []
        for row in np.asarray(X, dtype=np.float32):
            node = self.nodes[0]
            while len(node) == 4:
                feature, threshold, left, right = node
                node = self.nodes[left if float(row[feature]) <= threshold else right]
            probabilities.append(node[0])
        return np.asarray(probabilities)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]

    def rule_path(self, features):
        return describe_path(self.nodes, features)


def describe_path(nodes, features):
    path = []
    node = nodes[0]
    while len(node) == 4:
        feature, threshold, left, right = node
        goes_left = float(np.float32(features[feature])) <= threshold
        path.append(dict(name=NAVIGATION_FEATURES[feature], threshold=threshold,
                         operator='<=' if goes_left else '>'))
        node = nodes[left if goes_left else right]
    return path


def rule_path(model, features):
    if isinstance(model, PortableTree):
        return model.rule_path(features)
    if not hasattr(model, 'tree_'):
        return []
    tree = model.tree_
    nodes = [[int(tree.feature[i]), float(tree.threshold[i]), int(left), int(right)] if left >= 0 else [None]
             for i, (left, right) in enumerate(zip(tree.children_left, tree.children_right))]
    return describe_path(nodes, features)


def decode(content, world):
    if not isinstance(content, str) or len(content) > MAX_MODEL_BYTES:
        raise ValueError('Choose a Decision Tree JSON bundle under 256 KiB.')
    try:
        payload = json.loads(content)
    except (ValueError, RecursionError) as error:
        raise ValueError('Choose a valid Decision Tree JSON bundle.') from error
    return PortableTree(payload, world)


def encode(bundle):
    model = bundle['model']
    tree = model.tree_
    nodes = []
    for index in range(tree.node_count):
        left, right = int(tree.children_left[index]), int(tree.children_right[index])
        if left < 0:
            values = tree.value[index][0]
            nodes.append([(values / values.sum()).tolist()])
        else:
            nodes.append([int(tree.feature[index]), float(tree.threshold[index]), left, right])
    payload = dict(format=FORMAT, world=bundle['world'], features=NAVIGATION_FEATURES,
                   actions=NAVIGATION_ACTIONS, sectors=list(SECTOR_CENTERS_DEG), half_width=HALF_WIDTH_DEG,
                   classes=model.classes_.tolist(), feature_medians=bundle.get('feature_medians'), nodes=nodes)
    return json.dumps(payload, allow_nan=False, separators=(',', ':')).encode('utf-8')
