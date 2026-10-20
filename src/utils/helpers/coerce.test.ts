import { describe, it, expect } from '@jest/globals';
import { isTrue, parseJsonArray } from './coerce.js';

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

describe('parseJsonArray', () => {
  it('parses a JSON array sent as a string and leaves everything else alone', () => {
    expect(parseJsonArray('["a", "b"]')).toEqual(['a', 'b']);
    expect(parseJsonArray(' [{"name":"x","value":"y"}] ')).toEqual([{ name: 'x', value: 'y' }]);
    const list = ['a'];
    expect(parseJsonArray(list)).toBe(list);
    expect(parseJsonArray('a,b')).toBe('a,b');
    expect(parseJsonArray('[not json')).toBe('[not json');
    expect(parseJsonArray('{"a":1}')).toBe('{"a":1}');
    expect(parseJsonArray(undefined)).toBeUndefined();
  });
});
