"""Close dependents before dependencies; retain dependencies after failed drain."""


class ShutdownCoordinator:
    def __init__(self):
        self._resources = {}
        self._closed = set()

    def register(self, name, close, dependencies=()):
        if not name or name in self._resources or not callable(close):
            raise ValueError('Invalid shutdown registration')
        self._resources[name] = (close, tuple(dependencies))

    def close(self):
        order, visiting, visited = [], set(), set()
        def visit(name):
            if name not in self._resources:
                raise ValueError(f'Unknown dependency: {name}')
            if name in visiting:
                raise ValueError('Shutdown dependency cycle')
            if name in visited:
                return
            visiting.add(name)
            for dependency in self._resources[name][1]:
                visit(dependency)
            visiting.remove(name)
            visited.add(name)
            order.append(name)
        for name in self._resources:
            visit(name)
        failures, retained = {}, set()
        def retain(name):
            if name in retained:
                return
            retained.add(name)
            for dependency in self._resources[name][1]:
                retain(dependency)
        for name in reversed(order):
            if name in retained or name in self._closed:
                continue
            try:
                self._resources[name][0]()
                self._closed.add(name)
            except Exception as error:
                failures[name] = error
                retain(name)
        if failures:
            raise ExceptionGroup('Shutdown failed; dependencies retained', list(failures.values()))
