import type { OrchestratorTaskStatus } from './lifecycle.js';

export type TaskDependencyNode = {
  taskId: string;
  dependsOn?: ReadonlyArray<string>;
};

export type TaskDependencyGraph = {
  taskIds: ReadonlyArray<string>;
  dependenciesByTaskId: Readonly<Record<string, ReadonlyArray<string>>>;
  topologicalTaskIds: ReadonlyArray<string>;
  fingerprint: string;
};

export type DispatchTaskSnapshot = {
  taskId: string;
  status: OrchestratorTaskStatus;
};

export type DispatchPlan = {
  readyTaskIds: ReadonlyArray<string>;
  waitingTaskIds: ReadonlyArray<string>;
  terminalBlockedTaskIds: ReadonlyArray<string>;
};

export class DispatchPlannerError extends Error {
  public constructor(public readonly code: 'TASK_DAG_INVALID' | 'TASK_DAG_CYCLE' | 'TASK_SNAPSHOT_INVALID', message: string) {
    super(message);
    this.name = 'DispatchPlannerError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_TASKS = 500;

/** Compiles an immutable dependency graph. It never dispatches or mutates task state. */
export function compileTaskDependencyGraph(nodes: ReadonlyArray<TaskDependencyNode>): TaskDependencyGraph {
  if (nodes.length === 0 || nodes.length > MAX_TASKS || nodes.some((node) => !SAFE_ID.test(node.taskId))) {
    throw new DispatchPlannerError('TASK_DAG_INVALID', 'Task dependency graph geçerli değil.');
  }
  const taskIds = nodes.map((node) => node.taskId);
  if (new Set(taskIds).size !== taskIds.length) throw new DispatchPlannerError('TASK_DAG_INVALID', 'Task identity tekrar edemez.');
  const known = new Set(taskIds);
  const dependenciesByTaskId: Record<string, ReadonlyArray<string>> = {};
  for (const node of nodes) {
    const dependencies = [...(node.dependsOn ?? [])];
    if (dependencies.length > MAX_TASKS || dependencies.some((dependency) => !SAFE_ID.test(dependency) || !known.has(dependency) || dependency === node.taskId)
      || new Set(dependencies).size !== dependencies.length) {
      throw new DispatchPlannerError('TASK_DAG_INVALID', 'Task predecessor listesi geçerli değil.');
    }
    dependenciesByTaskId[node.taskId] = dependencies;
  }
  const topologicalTaskIds = topologicalOrder(taskIds, dependenciesByTaskId);
  return {
    taskIds: [...taskIds],
    dependenciesByTaskId: Object.fromEntries(taskIds.map((taskId) => [taskId, [...dependenciesByTaskId[taskId]!]])),
    topologicalTaskIds,
    fingerprint: fingerprint(taskIds, dependenciesByTaskId)
  };
}

/**
 * Produces an immutable ready/waiting/terminal-blocked decision only. Queue
 * publish, task state transitions, leases and retry policy are deliberately out of scope.
 */
export function planDispatch(graph: TaskDependencyGraph, snapshots: ReadonlyArray<DispatchTaskSnapshot>): DispatchPlan {
  validateGraphShape(graph);
  if (snapshots.length !== graph.taskIds.length || snapshots.some((snapshot) => !graph.taskIds.includes(snapshot.taskId))
    || new Set(snapshots.map((snapshot) => snapshot.taskId)).size !== snapshots.length) {
    throw new DispatchPlannerError('TASK_SNAPSHOT_INVALID', 'Task snapshot graph ile eşleşmiyor.');
  }
  const statusByTaskId = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot.status]));
  const readyTaskIds: string[] = [];
  const waitingTaskIds: string[] = [];
  const terminalBlockedTaskIds: string[] = [];
  for (const taskId of graph.topologicalTaskIds) {
    const status = statusByTaskId.get(taskId)!;
    if (status !== 'PENDING') continue;
    const dependencies = graph.dependenciesByTaskId[taskId]!;
    const predecessorStatuses = dependencies.map((dependencyId) => statusByTaskId.get(dependencyId)!);
    if (predecessorStatuses.some(isTerminallyUnsuccessful)) {
      terminalBlockedTaskIds.push(taskId);
    } else if (predecessorStatuses.every((predecessorStatus) => predecessorStatus === 'SUCCEEDED')) {
      readyTaskIds.push(taskId);
    } else {
      waitingTaskIds.push(taskId);
    }
  }
  return { readyTaskIds, waitingTaskIds, terminalBlockedTaskIds };
}

function topologicalOrder(taskIds: ReadonlyArray<string>, dependenciesByTaskId: Readonly<Record<string, ReadonlyArray<string>>>): string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const ordered: string[] = [];
  const visit = (taskId: string): void => {
    if (visited.has(taskId)) return;
    if (active.has(taskId)) throw new DispatchPlannerError('TASK_DAG_CYCLE', 'Task dependency graph cycle içeriyor.');
    active.add(taskId);
    for (const dependencyId of dependenciesByTaskId[taskId]!) visit(dependencyId);
    active.delete(taskId);
    visited.add(taskId);
    ordered.push(taskId);
  };
  for (const taskId of taskIds) visit(taskId);
  return ordered;
}

function validateGraphShape(graph: TaskDependencyGraph): void {
  if (graph.taskIds.length === 0 || graph.taskIds.length > MAX_TASKS || graph.taskIds.some((taskId) => !SAFE_ID.test(taskId))
    || graph.fingerprint !== fingerprint(graph.taskIds, graph.dependenciesByTaskId)) {
    throw new DispatchPlannerError('TASK_DAG_INVALID', 'Task dependency graph güvenilir değil.');
  }
  topologicalOrder(graph.taskIds, graph.dependenciesByTaskId);
}

function isTerminallyUnsuccessful(status: OrchestratorTaskStatus): boolean {
  return status === 'FAILED' || status === 'CANCELLED';
}

function fingerprint(taskIds: ReadonlyArray<string>, dependenciesByTaskId: Readonly<Record<string, ReadonlyArray<string>>>): string {
  return taskIds.map((taskId) => `${taskId}<-${[...(dependenciesByTaskId[taskId] ?? [])].sort().join(',')}`).join('|');
}
