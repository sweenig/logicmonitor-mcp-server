import { describe, it, expect, jest } from '@jest/globals';
import {
  runDebugCommand,
  fetchDebugResult,
  isDebugPending,
  normalizeWaitSeconds,
  DEFAULT_DEBUG_WAIT_SECONDS,
  MAX_DEBUG_WAIT_SECONDS,
} from './debug-command.js';

const PENDING = { errorMessage: 'agent has fetched the task, waiting for response', errorCode: 1202, errorDetail: null };

function fakeClient(started: any, results: any[]) {
  const queue = [...results];
  return {
    executeDebugCommand: jest.fn<(cmdline: string, collectorId: number) => Promise<any>>(async () => started),
    getDebugCommandResult: jest.fn<(id: string, collectorId: number) => Promise<any>>(async () => {
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}

describe('isDebugPending', () => {
  it('recognizes the 1202 waiting state by code or message', () => {
    expect(isDebugPending(PENDING)).toBe(true);
    expect(isDebugPending({ errorCode: 1202 })).toBe(true);
    expect(isDebugPending({ errorMessage: 'agent has fetched the task, waiting for response' })).toBe(true);
  });

  it('does not treat output or other errors as pending', () => {
    expect(isDebugPending({ output: 'returns 0\noutput:\nhi' })).toBe(false);
    expect(isDebugPending({ errorCode: 1404, errorMessage: 'not found' })).toBe(false);
    expect(isDebugPending(null)).toBe(false);
    expect(isDebugPending('text')).toBe(false);
  });
});

describe('normalizeWaitSeconds', () => {
  it('uses the default for missing or invalid values and clamps the rest', () => {
    expect(normalizeWaitSeconds(undefined, 30)).toBe(30);
    expect(normalizeWaitSeconds('10', 30)).toBe(30);
    expect(normalizeWaitSeconds(NaN, 30)).toBe(30);
    expect(normalizeWaitSeconds(-5, 30)).toBe(0);
    expect(normalizeWaitSeconds(0, 30)).toBe(0);
    expect(normalizeWaitSeconds(15, 30)).toBe(15);
    expect(normalizeWaitSeconds(100000, 30)).toBe(MAX_DEBUG_WAIT_SECONDS);
  });
});

describe('runDebugCommand', () => {
  const started = { output: '', sessionId: '123', cmdline: '!groovy\nprintln "a very long script"', cmdContext: '' };

  it('polls past the pending state and returns the finished output without echoing the command', async () => {
    const client = fakeClient(started, [PENDING, { output: 'returns 0\noutput:\ndone\n', sessionId: '123', cmdline: null, cmdContext: '' }]);

    const result = await runDebugCommand(client, '!groovy\nprintln "a very long script"', 6, { waitSeconds: 5, pollIntervalMs: 1 });

    expect(client.executeDebugCommand).toHaveBeenCalledTimes(1);
    expect(client.getDebugCommandResult).toHaveBeenCalledTimes(2);
    expect(client.getDebugCommandResult).toHaveBeenCalledWith('123', 6);
    expect(result).toEqual({ output: 'returns 0\noutput:\ndone\n', sessionId: '123', cmdContext: '', pending: false });
    expect(result.cmdline).toBeUndefined();
  });

  it('includes the command line only when asked', async () => {
    const client = fakeClient(started, [{ output: 'ok', sessionId: '123', cmdline: null }]);
    const result = await runDebugCommand(client, '!tlist', 6, { waitSeconds: 5, includeCommand: true, pollIntervalMs: 1 });
    expect(result.cmdline).toBe('!tlist');
  });

  it('returns a pending result with the session id when the wait runs out', async () => {
    const client = fakeClient(started, [PENDING]);

    const result = await runDebugCommand(client, '!groovy', 6, { waitSeconds: 0.05, pollIntervalMs: 10 });

    expect(result.pending).toBe(true);
    expect(result.sessionId).toBe('123');
    expect(result.output).toBe('');
    expect(result.message).toContain('get_debug_command_result');
    expect(client.getDebugCommandResult.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not poll at all when waitSeconds is 0', async () => {
    const client = fakeClient(started, [PENDING]);

    const result = await runDebugCommand(client, '!groovy', 6, { waitSeconds: 0 });

    expect(client.getDebugCommandResult).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sessionId: '123', pending: true, output: '' });
    expect(result.cmdline).toBeUndefined();
  });

  it('returns output that already came back with the start response', async () => {
    const client = fakeClient({ output: 'immediate', sessionId: '9', cmdline: 'help' }, [PENDING]);

    const result = await runDebugCommand(client, 'help', 6, { waitSeconds: 5, pollIntervalMs: 1 });

    expect(client.getDebugCommandResult).not.toHaveBeenCalled();
    expect(result).toEqual({ output: 'immediate', sessionId: '9', pending: false });
  });

  it('returns a start response that has nothing to poll', async () => {
    const client = fakeClient({ output: 'no session', cmdline: 'x' }, [PENDING]);

    const result = await runDebugCommand(client, 'x', 6);

    expect(client.getDebugCommandResult).not.toHaveBeenCalled();
    expect(result).toEqual({ output: 'no session', pending: false });
  });

  it('waits the default time when waitSeconds is not given', async () => {
    expect(DEFAULT_DEBUG_WAIT_SECONDS).toBe(30);
    const client = fakeClient(started, [{ output: 'fast', sessionId: '123' }]);
    const result = await runDebugCommand(client, '!tlist', 6, { pollIntervalMs: 1 });
    expect(result.output).toBe('fast');
  });

  it('lets errors other than the pending state propagate', async () => {
    const client = fakeClient(started, [new Error('session not found')]);
    await expect(runDebugCommand(client, '!groovy', 6, { waitSeconds: 5, pollIntervalMs: 1 })).rejects.toThrow('session not found');
  });
});

describe('fetchDebugResult', () => {
  it('makes one request and reports pending when waitSeconds is 0', async () => {
    const client = fakeClient({}, [PENDING]);

    const result = await fetchDebugResult(client, '55', 6, 0);

    expect(client.getDebugCommandResult).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sessionId: '55', pending: true, output: '' });
  });

  it('returns finished output with the session id', async () => {
    const client = fakeClient({}, [{ output: 'text', cmdline: null }]);

    const result = await fetchDebugResult(client, '55', 6, 0);

    expect(result).toEqual({ output: 'text', sessionId: '55', pending: false });
  });
});
