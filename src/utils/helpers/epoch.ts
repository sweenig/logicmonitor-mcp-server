/**
 * Epoch unit normalization. LogicMonitor's /data endpoints take epoch SECONDS while
 * SDT start/end take epoch MILLISECONDS, and callers (LLMs especially) mix them up.
 * 1e11 is the dividing line: as seconds it would be year 5138, as milliseconds it is
 * March 1973, so no realistic value is ambiguous.
 */
const MS_THRESHOLD = 1e11;

/** Convert to epoch seconds; values that look like milliseconds are divided by 1000. */
export function toEpochSeconds(value: number | undefined): number | undefined {
  if (typeof value !== 'number') return value;
  return value > MS_THRESHOLD ? Math.floor(value / 1000) : value;
}

/** Convert to epoch milliseconds; values that look like seconds are multiplied by 1000. */
export function toEpochMillis(value: number | undefined): number | undefined {
  if (typeof value !== 'number') return value;
  return value > 0 && value < MS_THRESHOLD ? value * 1000 : value;
}
