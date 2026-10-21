import { describe, it, expect } from '@jest/globals';
import { buildWebsiteCreate, buildWebsiteUpdate, normalizeSteps } from './website-payload.js';

describe('normalizeSteps', () => {
  it('fills in the step fields LogicMonitor expects and keeps what the caller set', () => {
    const [step] = normalizeSteps([{ url: '/health', statusCode: '204', keyword: 'ok' }], 'http');
    expect(step).toMatchObject({
      type: 'config', name: '__step0', enable: true, HTTPMethod: 'GET', url: '/health', schema: 'http',
      statusCode: '204', keyword: 'ok', followRedirection: true, timeout: 30,
    });
  });

  it('accepts a JSON string and numbers the steps', () => {
    const steps = normalizeSteps('[{"url":"/a"},{"url":"/b","name":"custom"}]');
    expect(steps.map(s => s.name)).toEqual(['__step0', 'custom']);
  });

  it('rejects something that is not a list', () => {
    expect(() => normalizeSteps('nope')).toThrow(/array/);
  });
});

describe('buildWebsiteCreate', () => {
  it('builds a web check with schema and a default step', () => {
    const body = buildWebsiteCreate({ name: 'n', type: 'webcheck', domain: 'a.example.com', pollingInterval: '2', ignoreSSL: 'false' });
    expect(body).toMatchObject({ type: 'webcheck', name: 'n', domain: 'a.example.com', schema: 'https', pollingInterval: 2, ignoreSSL: false });
    expect(body.steps).toHaveLength(1);
  });

  it('builds a ping check without web fields', () => {
    const body = buildWebsiteCreate({ name: 'n', type: 'pingcheck', host: 'h', count: 5, percentPktsNotReceiveInTime: 80 });
    expect(body).toEqual({ type: 'pingcheck', name: 'n', host: 'h', count: 5, percentPktsNotReceiveInTime: 80 });
  });

  it('uses the steps that were given', () => {
    const body = buildWebsiteCreate({ name: 'n', type: 'webcheck', domain: 'd', steps: [{ url: '/x' }, { url: '/y' }] });
    expect(body.steps.map((s: any) => s.url)).toEqual(['/x', '/y']);
  });

  it('rejects a bad type, interval, transition, level and schema', () => {
    expect(() => buildWebsiteCreate({ name: 'n', type: 'httpcheck', domain: 'd' })).toThrow(/webcheck.*pingcheck/);
    expect(() => buildWebsiteCreate({ name: 'n', type: 'pingcheck', host: 'h', pollingInterval: 0 })).toThrow(/pollingInterval/);
    expect(() => buildWebsiteCreate({ name: 'n', type: 'pingcheck', host: 'h', transition: 11 })).toThrow(/transition/);
    expect(() => buildWebsiteCreate({ name: 'n', type: 'pingcheck', host: 'h', individualAlertLevel: 'x' })).toThrow(/individualAlertLevel/);
    expect(() => buildWebsiteCreate({ name: 'n', type: 'webcheck', domain: 'd', schema: 'ftp' })).toThrow(/schema/);
    expect(() => buildWebsiteCreate({ type: 'pingcheck', host: 'h' })).toThrow(/name is required/);
  });

  it('accepts the documented transition values', () => {
    for (const transition of [1, 10, 30, 60]) {
      expect(buildWebsiteCreate({ name: 'n', type: 'pingcheck', host: 'h', transition }).transition).toBe(transition);
    }
  });
});

describe('buildWebsiteUpdate', () => {
  it('returns only what was given', () => {
    expect(buildWebsiteUpdate({ websiteId: 1, domain: 'd', stopMonitoring: true })).toEqual({ domain: 'd', stopMonitoring: true });
    expect(buildWebsiteUpdate({ websiteId: 1 })).toEqual({});
  });

  it('validates the same ranges as create', () => {
    expect(() => buildWebsiteUpdate({ pollingInterval: 11 })).toThrow(/pollingInterval/);
  });
});
