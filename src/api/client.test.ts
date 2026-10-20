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

  describe('unset ID guard', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('throws without sending a request when a path ID is undefined', async () => {
      global.fetch = jest.fn() as unknown as typeof fetch;
      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });

      await expect(client.updateDataSource(undefined as unknown as number, {})).rejects.toThrow(/unset ID/);
      await expect(client.getDataSource(NaN)).rejects.toThrow(/unset ID/);
      expect(global.fetch).not.toHaveBeenCalled();
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

    it('returns CSV bodies wrapped in an object instead of failing JSON parsing', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        json: async () => { throw new Error('not json'); },
        text: async () => 'Timestamp,uptime\n1791763179,100\n',
      } as unknown as Response)) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });
      const result = await client.getDeviceDataSourceInstanceData(1, 2, 3, { format: 'csv' });

      expect(result).toEqual({ format: 'csv', data: 'Timestamp,uptime\n1791763179,100\n' });
    });

    it('follows nextPageParams when autoPaginate is set and respects maxPages', async () => {
      const urls: string[] = [];
      global.fetch = jest.fn(async (url: any) => {
        urls.push(String(url));
        const u = new URL(String(url));
        const end = Number(u.searchParams.get('end') ?? 300);
        const page = end >= 300 ? 1 : end >= 100 ? 2 : 3;
        const body = page === 1
          ? { dataPoints: ['a'], values: [[3]], time: [3000], nextPageParams: 'start=0&end=199' }
          : page === 2
            ? { dataPoints: ['a'], values: [[2]], time: [2000], nextPageParams: 'start=0&end=99' }
            : { dataPoints: ['a'], values: [[1]], time: [1000], nextPageParams: '' };
        return { ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response;
      }) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });

      const all: any = await client.getDeviceDataSourceInstanceData(1, 2, 3, { start: 0, end: 300, autoPaginate: true });
      expect(all.values).toEqual([[3], [2], [1]]);
      expect(all.truncated).toBeUndefined();

      urls.length = 0;
      const capped: any = await client.getDeviceDataSourceInstanceData(1, 2, 3, { start: 0, end: 300, autoPaginate: true, maxPages: 2 });
      expect(capped.values).toEqual([[3], [2]]);
      expect(capped.truncated).toBe(true);
      expect(urls).toHaveLength(2);
    });

    it('marks single-page instance data as truncated when more exists', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ dataPoints: ['a'], values: [[1]], time: [1000], nextPageParams: 'start=0&end=50' }),
      } as unknown as Response)) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });
      const result: any = await client.getDeviceDataSourceInstanceData(1, 2, 3, {});
      expect(result.truncated).toBe(true);
      expect(result.truncationNote).toContain('end=50');
    });

    it('returns a summary when summarize is set', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ dataPoints: ['a'], values: [[2], [1]], time: [2000, 1000], nextPageParams: '' }),
      } as unknown as Response)) as unknown as typeof fetch;

      const client = new LogicMonitorClient({ company: 'test', bearerToken: 'token' });
      const result: any = await client.getDeviceDataSourceInstanceData(1, 2, 3, { summarize: true });
      expect(result.datapoints.a).toMatchObject({ min: 1, max: 2, first: 1, last: 2 });
      expect(result.values).toBeUndefined();
    });

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

describe('property upsert', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  const reply = (status: number, body: any) => ({
    ok: status < 400,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response);

  const mockFetch = (...responses: Response[]) => {
    const calls: { method: string; url: string; body: any }[] = [];
    let i = 0;
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ method: init.method, url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
      return responses[i++];
    }) as unknown as typeof fetch;
    return calls;
  };

  const notFound = reply(404, { errorMessage: 'Property(name=my.prop) is not found in device<6>', errorCode: 1404 });
  const newClient = () => new LogicMonitorClient({ company: 'test', bearerToken: 'token' });

  it.each([
    ['device', 'updateDeviceProperty', '/device/devices/6/properties'],
    ['group', 'updateDeviceGroupProperty', '/device/groups/6/properties'],
  ] as const)('updates an existing %s property with a single PATCH', async (_kind, method, path) => {
    const calls = mockFetch(reply(200, { name: 'my.prop', value: 'v' }));
    const result = await newClient()[method](6, 'my.prop', 'v');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain(`${path}/my.prop`);
    expect(result).toMatchObject({ name: 'my.prop', action: 'updated' });
  });

  it.each([
    ['device', 'updateDeviceProperty', '/device/devices/6/properties'],
    ['group', 'updateDeviceGroupProperty', '/device/groups/6/properties'],
  ] as const)('creates a missing %s property via POST after a property-not-found 404', async (_kind, method, path) => {
    const calls = mockFetch(notFound, reply(200, { name: 'my.prop', value: 'v' }));
    const result = await newClient()[method](6, 'my.prop', 'v');

    expect(calls.map(c => c.method)).toEqual(['PATCH', 'POST']);
    expect(calls[1].url).toContain(path);
    expect(calls[1].url).not.toContain('my.prop');
    expect(calls[1].body).toEqual({ name: 'my.prop', value: 'v' });
    expect(result).toMatchObject({ name: 'my.prop', action: 'created' });
  });

  it.each([
    ['device', 'updateDeviceProperty'],
    ['group', 'updateDeviceGroupProperty'],
  ] as const)('does not create on a 404 that is not property-not-found (%s)', async (_kind, method) => {
    const calls = mockFetch(reply(404, { errorMessage: 'Device is not found' }));
    await expect(newClient()[method](6, 'my.prop', 'v')).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['device', 'updateDeviceProperty'],
    ['group', 'updateDeviceGroupProperty'],
  ] as const)('does not create on a non-404 error (%s)', async (_kind, method) => {
    const calls = mockFetch(reply(403, { errorMessage: 'Forbidden' }));
    await expect(newClient()[method](6, 'my.prop', 'v')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['device', 'deleteDeviceProperty', '/device/devices/6/properties/my.prop'],
    ['group', 'deleteDeviceGroupProperty', '/device/groups/6/properties/my.prop'],
  ] as const)('deletes a %s property with DELETE on the named path', async (_kind, method, path) => {
    const calls = mockFetch(reply(200, {}));
    await newClient()[method](6, 'my.prop');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toContain(path);
  });
});
