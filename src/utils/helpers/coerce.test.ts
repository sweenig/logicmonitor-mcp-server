import { describe, it, expect } from '@jest/globals';
import { isTrue } from './coerce.js';

describe('isTrue', () => {
  it('accepts true and the string "true" in any case', () => {
    expect(isTrue(true)).toBe(true);
    expect(isTrue('true')).toBe(true);
    expect(isTrue(' TRUE ')).toBe(true);
  });

  it('treats false, "false" and everything else as false', () => {
    expect(isTrue(false)).toBe(false);
    expect(isTrue('false')).toBe(false);
    expect(isTrue('yes')).toBe(false);
    expect(isTrue(1)).toBe(false);
    expect(isTrue(undefined)).toBe(false);
    expect(isTrue(null)).toBe(false);
  });
});
