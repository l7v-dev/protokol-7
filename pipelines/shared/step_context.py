"""Resolve whole input expressions through mapping keys without evaluation."""
from collections.abc import Mapping
import re


class StepContext:
    def __init__(self, inputs):
        if not isinstance(inputs, Mapping):
            raise TypeError('inputs must be a mapping')
        self.inputs = inputs

    def resolve(self, expression):
        if not isinstance(expression, str):
            raise ValueError('Invalid input expression')
        match = re.fullmatch(r'\$\{input\.([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)\}', expression)
        if not match:
            raise ValueError('Expected ${input.key} expression')
        value = self.inputs
        for key in match[1].split('.'):
            if not isinstance(value, Mapping) or key not in value:
                raise KeyError(key)
            value = value[key]
        return value
