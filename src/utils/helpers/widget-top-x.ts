/**
 * LogicMonitor limits a dynamic table widget's "topX" to 1-25, or -1 for all rows; any other value
 * fails with HTTP 400 "invalid top". Catch it first with a message that names the fix.
 */
export function isAcceptedTopX(topX: unknown): boolean {
  const value = typeof topX === 'string' && topX.trim() !== '' ? Number(topX) : topX;
  if (typeof value !== 'number' || Number.isNaN(value)) return true; // not a number: leave it to LogicMonitor
  return value === -1 || (Number.isInteger(value) && value >= 1 && value <= 25);
}

export function topXErrorMessage(topX: unknown): string {
  return `topX ${JSON.stringify(topX)} is not accepted for a dynamicTable widget (LogicMonitor would reject it with "invalid top"). Use -1 to list all rows, or a number from 1 to 25.`;
}
