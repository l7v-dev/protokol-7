import { describe, expect, it } from 'vitest';

import { compileTaskDependencyGraph, DispatchPlannerError, planDispatch } from '../../src/orchestrator/dispatch-planner.js';

const graph = compileTaskDependencyGraph([
  { taskId: 'fetch' },
  { taskId: 'extract', dependsOn: ['fetch'] },
  { taskId: 'validate', dependsOn: ['extract'] },
  { taskId: 'notify', dependsOn: ['fetch'] }
]);

describe('task dependency DAG and dispatch planner', () => {
  it('creates a deterministic graph and releases only pending tasks with successful predecessors', () => {
    const plan = planDispatch(graph, [
      { taskId: 'fetch', status: 'SUCCEEDED' },
      { taskId: 'extract', status: 'PENDING' },
      { taskId: 'validate', status: 'PENDING' },
      { taskId: 'notify', status: 'PENDING' }
    ]);

    expect(graph.topologicalTaskIds).toEqual(['fetch', 'extract', 'validate', 'notify']);
    expect(plan).toEqual({ readyTaskIds: ['extract', 'notify'], waitingTaskIds: ['validate'], terminalBlockedTaskIds: [] });
  });

  it('does not dispatch successor tasks while a predecessor is unfinished or terminally unsuccessful', () => {
    const waiting = planDispatch(graph, [
      { taskId: 'fetch', status: 'RUNNING' },
      { taskId: 'extract', status: 'PENDING' },
      { taskId: 'validate', status: 'PENDING' },
      { taskId: 'notify', status: 'PENDING' }
    ]);
    const blocked = planDispatch(graph, [
      { taskId: 'fetch', status: 'FAILED' },
      { taskId: 'extract', status: 'PENDING' },
      { taskId: 'validate', status: 'PENDING' },
      { taskId: 'notify', status: 'PENDING' }
    ]);

    expect(waiting).toEqual({ readyTaskIds: [], waitingTaskIds: ['extract', 'validate', 'notify'], terminalBlockedTaskIds: [] });
    expect(blocked).toEqual({ readyTaskIds: [], waitingTaskIds: ['validate'], terminalBlockedTaskIds: ['extract', 'notify'] });
  });

  it('rejects unknown/self/duplicate dependencies, cycles, altered graph fingerprints and incomplete snapshots', () => {
    expect(() => compileTaskDependencyGraph([{ taskId: 'one', dependsOn: ['two'] }])).toThrow(DispatchPlannerError);
    expect(() => compileTaskDependencyGraph([{ taskId: 'one', dependsOn: ['one'] }])).toThrow(DispatchPlannerError);
    expect(() => compileTaskDependencyGraph([{ taskId: 'one', dependsOn: ['two'] }, { taskId: 'two', dependsOn: ['one'] }])).toThrowError(expect.objectContaining({ code: 'TASK_DAG_CYCLE' }));
    expect(() => planDispatch({ ...graph, fingerprint: 'altered' }, [])).toThrow(DispatchPlannerError);
    expect(() => planDispatch(graph, [{ taskId: 'fetch', status: 'PENDING' }])).toThrowError(expect.objectContaining({ code: 'TASK_SNAPSHOT_INVALID' }));
  });
});
