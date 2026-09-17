/**
 * Tests for LogicMonitor API Client
 */

import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import { escapeFilterValue, LogicMonitorClient } from './client.js';
import { rateLimiter } from '../utils/core/rate-limiter.js';

describe('LogicMonitor Client Utils', () => {
  describe('escapeFilterValue', () => {
    it('should escape parentheses', () => {
      expect(escapeFilterValue('test (value)')).toBe('test \\(value\\)');
      expect(escapeFilterValue('(test)')).toBe('\\(test\\)');
    });

    it('should escape colons', () => {
      expect(escapeFilterValue('test:value')).toBe('test\\:value');
    });

    it('should escape commas', () => {
      expect(escapeFilterValue('test,value')).toBe('test\\,value');
    });

    it('should escape tildes', () => {
      expect(escapeFilterValue('test~value')).toBe('test\\~value');
    });

    it('should escape quotes', () => {
      expect(escapeFilterValue('test"value')).toBe('test\\"value');
    });

    it('should escape backslashes', () => {
      expect(escapeFilterValue('test\\value')).toBe('test\\\\value');
    });

    it('should NOT escape asterisks (wildcards)', () => {
      expect(escapeFilterValue('*test*')).toBe('*test*');
      expect(escapeFilterValue('test*value')).toBe('test*value');
    });

    it('should handle multiple special characters', () => {
      expect(escapeFilterValue('test:value,name~"data"')).toBe('test\\:value\\,name\\~\\"data\\"');
    });

    it('should handle empty string', () => {
      expect(escapeFilterValue('')).toBe('');
    });

    it('should handle strings with no special characters', () => {
      expect(escapeFilterValue('testvalue')).toBe('testvalue');
    });
  });

  describe('rate limit retry', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      rateLimiter.clear();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    it('retries a 429 using the window from the rate limit headers and succeeds', async () => {
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({
              'x-rate-limit-limit': '100',
              'x-rate-limit-remaining': '0',
              'x-rate-limit-window': '1',
            }),
            json: async () => ({ errorMessage: 'Too many requests from this IP, please try again later.' }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: 1, description: 'test-collector' }),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });
      const result = await client.getCollector(1);

      expect(callCount).toBe(2);
      expect(result).toEqual({ id: 1, description: 'test-collector' });
    }, 10000);

    it('does not retry non-rate-limit errors', async () => {
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ errorMessage: 'Collector not found' }),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });

      await expect(client.getCollector(1)).rejects.toThrow();
      expect(callCount).toBe(1);
    });
  });
});

