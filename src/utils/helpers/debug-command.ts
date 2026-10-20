/**
 * Debug command execution with result waiting.
 *
 * LogicMonitor runs a debug command asynchronously on the collector: POST /debug always returns an
 * empty output and a sessionId (even for "help"), and the output is fetched with GET /debug/{id}.
 * That GET waits on the server for a few seconds and, while the collector is still working, answers
 * HTTP 202 with errorCode 1202 ("agent has fetched the task, waiting for response") - a progress
 * state, not a failure. These helpers hide that two-step protocol: run the command, poll until the
 * output is ready or the wait budget runs out, and report an unfinished command as `pending: true`.
 */

export interface DebugCommandClient {
  executeDebugCommand(cmdline: string, collectorId: number): Promise<any>;
  getDebugCommandResult(id: string, collectorId: number): Promise<any>;
}

export interface DebugRunOptions {
  /** Seconds to wait for the output before giving up and returning a pending result (0 = do not wait). */
  waitSeconds?: number | string;
  /** Include the command line that was sent in the result. */
  includeCommand?: boolean | string;
  /** Minimum pause between polls when the server answers immediately (tests use a tiny value). */
  pollIntervalMs?: number;
}

export const DEFAULT_DEBUG_WAIT_SECONDS = 30;
export const MAX_DEBUG_WAIT_SECONDS = 120;
const DEFAULT_POLL_INTERVAL_MS = 500;
const PENDING_ERROR_CODE = 1202;

/**
 * Clamp a caller-supplied wait to 0..MAX. Numeric strings are accepted because MCP clients do not
 * always send numbers as numbers ("0" must mean 0, not "use the default"); anything else that is not
 * a finite number falls back to the default.
 */
export function normalizeWaitSeconds(value: unknown, defaultSeconds: number): number {
  let seconds: number;
  if (typeof value === 'number') {
    seconds = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    seconds = Number(value);
  } else {
    return defaultSeconds;
  }
  if (!Number.isFinite(seconds)) {
    return defaultSeconds;
  }
  return Math.min(MAX_DEBUG_WAIT_SECONDS, Math.max(0, seconds));
}

/** True for true and "true" (any case); a string "false" must not count as truthy. */
function isTrue(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

/** True when a GET /debug/{id} answer means "the collector has not finished yet". */
export function isDebugPending(result: any): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }
  if (Number(result.errorCode) === PENDING_ERROR_CODE) {
    return true;
  }
  return typeof result.errorMessage === 'string'
    && /waiting for response|has (not )?fetched the task/i.test(result.errorMessage);
}

function pendingResult(sessionId: string): Record<string, any> {
  return {
    sessionId,
    output: '',
    pending: true,
    message: 'The command is still running on the collector. Call get_debug_command_result with this sessionId '
      + '(and the same collectorId) to fetch the output; add waitSeconds to wait longer.',
  };
}

function completedResult(result: any, sessionId: string | undefined, command?: string): Record<string, any> {
  // The command line is not echoed back unless asked for: callers know what they sent, and scripts can be long.
  const completed: Record<string, any> = { ...(result ?? {}) };
  delete completed.cmdline;
  const id = completed.sessionId ?? sessionId;
  if (id !== undefined) {
    completed.sessionId = id;
  }
  completed.pending = false;
  if (command !== undefined) {
    completed.cmdline = command;
  }
  return completed;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch the result of a started debug command, polling until it is ready or `waitSeconds` has
 * passed. Always makes at least one request. Errors other than the pending state propagate.
 */
export async function fetchDebugResult(
  client: DebugCommandClient,
  sessionId: string,
  collectorId: number,
  waitSeconds: number,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  command?: string,
): Promise<Record<string, any>> {
  const deadline = Date.now() + waitSeconds * 1000;

  for (;;) {
    const requestedAt = Date.now();
    const result = await client.getDebugCommandResult(sessionId, collectorId);
    if (!isDebugPending(result)) {
      return completedResult(result, sessionId, command);
    }
    if (Date.now() >= deadline) {
      return pendingResult(sessionId);
    }
    // The server normally holds the request for a few seconds; only pause if it answered at once.
    const elapsed = Date.now() - requestedAt;
    if (elapsed < pollIntervalMs) {
      await sleep(pollIntervalMs - elapsed);
    }
  }
}

/** Start a debug command and wait (up to waitSeconds) for its output. */
export async function runDebugCommand(
  client: DebugCommandClient,
  cmdline: string,
  collectorId: number,
  options: DebugRunOptions = {},
): Promise<Record<string, any>> {
  const waitSeconds = normalizeWaitSeconds(options.waitSeconds, DEFAULT_DEBUG_WAIT_SECONDS);
  const command = isTrue(options.includeCommand) ? cmdline : undefined;

  const started = await client.executeDebugCommand(cmdline, collectorId);
  const sessionId: string | undefined = started?.sessionId ?? started?.cmdContext ?? undefined;

  // Output that already came back with the start response (or a response with nothing to poll).
  if (!sessionId || (typeof started?.output === 'string' && started.output.length > 0)) {
    return completedResult(started, sessionId, command);
  }

  if (waitSeconds === 0) {
    const pending = pendingResult(String(sessionId));
    return command !== undefined ? { ...pending, cmdline: command } : pending;
  }

  return fetchDebugResult(client, String(sessionId), collectorId, waitSeconds, options.pollIntervalMs, command);
}
