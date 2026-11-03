import { describe, it, expect } from '@jest/globals';
import { isAcceptedTopX, topXErrorMessage } from './widget-top-x.js';

describe('isAcceptedTopX', () => {
  it('accepts -1 and 1-25, as numbers or numeric strings', () => {
    for (const v of [-1, 1, 10, 25, '-1', '25']) expect(isAcceptedTopX(v)).toBe(true);
  });

  it('rejects other numbers', () => {
    for (const v of [0, -2, 26, 50, 1000, 2.5, '100']) expect(isAcceptedTopX(v)).toBe(false);
  });

  it('leaves an absent or non-numeric topX alone', () => {
    for (const v of [undefined, null, 'all']) expect(isAcceptedTopX(v)).toBe(true);
  });

  it('names the fix in the message', () => {
    expect(topXErrorMessage(50)).toContain('-1');
  });
});
