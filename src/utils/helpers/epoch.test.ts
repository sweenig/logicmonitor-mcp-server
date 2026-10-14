import { describe, it, expect } from '@jest/globals';
import { toEpochSeconds, toEpochMillis } from './epoch.js';

describe('epoch helpers', () => {
  it('converts milliseconds to seconds and leaves seconds alone', () => {
    expect(toEpochSeconds(1791494000123)).toBe(1791494000);
    expect(toEpochSeconds(1791494000)).toBe(1791494000);
    expect(toEpochSeconds(undefined)).toBeUndefined();
  });

  it('converts seconds to milliseconds and leaves milliseconds alone', () => {
    expect(toEpochMillis(1791494000)).toBe(1791494000000);
    expect(toEpochMillis(1791494000000)).toBe(1791494000000);
    expect(toEpochMillis(undefined)).toBeUndefined();
  });
});
