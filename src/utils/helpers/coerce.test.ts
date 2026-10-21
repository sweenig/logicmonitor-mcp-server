import { describe, it, expect } from '@jest/globals';
import { isTrue, parseJsonArray, parseJsonObject, toNumberIfNumeric } from './coerce.js';

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

describe('parseJsonObject and toNumberIfNumeric', () => {
  it('parses a JSON object sent as a string and leaves everything else alone', () => {
    expect(parseJsonObject('{"collectorIds":[1]}')).toEqual({ collectorIds: [1] });
    const obj = { a: 1 };
    expect(parseJsonObject(obj)).toBe(obj);
    expect(parseJsonObject('[1]')).toBe('[1]');
    expect(parseJsonObject('{bad')).toBe('{bad');
    expect(parseJsonObject(undefined)).toBeUndefined();
  });

  it('turns numeric strings into numbers', () => {
    expect(toNumberIfNumeric('5')).toBe(5);
    expect(toNumberIfNumeric(' 2.5 ')).toBe(2.5);
    expect(toNumberIfNumeric('abc')).toBe('abc');
    expect(toNumberIfNumeric('')).toBe('');
    expect(toNumberIfNumeric(7)).toBe(7);
  });
});
