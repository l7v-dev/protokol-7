import { describe, expect, it } from 'vitest';

import {
  assertJobTransition,
  assertTaskTransition,
  canTransitionJob,
  canTransitionTask
} from '../../src/orchestrator/lifecycle.js';


describe('orchestrator lifecycle guards', () => {
  it('allows supported job transitions', () => {
    expect(canTransitionJob('CREATED', 'DISPATCH_PENDING')).toBe(true);
    expect(canTransitionJob('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransitionJob('FAILED', 'RETRYING')).toBe(true);
    expect(() => assertJobTransition('CANCEL_REQUESTED', 'CANCELLED')).not.toThrow();
  });

  it('rejects unsupported job transitions with a terminal contract error', () => {
    expect(canTransitionJob('COMPLETED', 'RUNNING')).toBe(false);
    expect(() => assertJobTransition('COMPLETED', 'RUNNING')).toThrowError(
      expect.objectContaining({
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 409
      })
    );
  });

  it('allows supported task transitions', () => {
    expect(canTransitionTask('PENDING', 'CLAIMED')).toBe(true);
    expect(canTransitionTask('CLAIMED', 'RUNNING')).toBe(true);
    expect(canTransitionTask('RUNNING', 'SUCCEEDED')).toBe(true);
    expect(() => assertTaskTransition('TIMEOUT', 'PENDING')).not.toThrow();
  });

  it('rejects unsupported task transitions with the same deterministic error code', () => {
    expect(canTransitionTask('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(() => assertTaskTransition('SUCCEEDED', 'RUNNING')).toThrowError(
      expect.objectContaining({
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 409
      })
    );
  });
});
