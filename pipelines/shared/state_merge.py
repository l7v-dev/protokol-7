"""Deterministic JSON state merge without mutating either checkpoint."""

import copy
import json


def validate_state(state):
    if not isinstance(state, dict):
        raise ValueError("state must be a JSON object")

    def check_keys(value):
        if isinstance(value, dict):
            if any(not isinstance(key, str) for key in value):
                raise ValueError("state keys must be strings")
            for child in value.values():
                check_keys(child)
        elif isinstance(value, list):
            for child in value:
                check_keys(child)
    check_keys(state)
    json.dumps(state, allow_nan=False)


def merge_partial(existing_completed: dict, new_partial: dict) -> dict:
    """Recursively merge objects; arrays, scalars and explicit null replace values."""
    validate_state(existing_completed)
    validate_state(new_partial)
    result = copy.deepcopy(existing_completed)
    for key, value in new_partial.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge_partial(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result
