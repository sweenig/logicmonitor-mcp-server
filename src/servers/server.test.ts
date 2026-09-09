/**
 * Tests for the shared MCP server factory - specifically the read-only
 * enforcement in the tool-call handler.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { createServer } from './server.js';
import { getLogicMonitorTools } from '../api/tools.js';

function getCallToolHandler(server: ReturnType<typeof createServer>['server']) {
  const handler = (server as any)._requestHandlers.get('tools/call');
  if (!handler) {
    throw new Error('tools/call handler was not registered');
  }
  return handler;
}

describe('createServer read-only enforcement', () => {
  const readOnlyTools = getLogicMonitorTools(true);

  it('blocks a write tool call when readOnly is true, even if the tool was never advertised', async () => {
    const handleToolCall = jest.fn();
    const lmHandlers: any = { handleToolCall, formatResponse: jest.fn() };

    const { server } = createServer({
      version: '1.0.0',
      tools: readOnlyTools, // write tools are NOT in this list
      lmHandlers,
      readOnly: true,
    });

    const callTool = getCallToolHandler(server);
    const response = await callTool(
      { method: 'tools/call', params: { name: 'acknowledge_alert', arguments: { alertId: 'DS1', ackComment: 'test' } } },
      { requestId: '1' },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('read_only_mode');
    expect(response.content[0].text).toContain('acknowledge_alert');
    expect(handleToolCall).not.toHaveBeenCalled();
  });

  it('allows a read-only tool call when readOnly is true', async () => {
    const handleToolCall = jest.fn(async (..._args: any[]) => ({ id: 123 }));
    const lmHandlers: any = { handleToolCall, formatResponse: jest.fn(() => '{}') };

    const { server } = createServer({
      version: '1.0.0',
      tools: readOnlyTools,
      lmHandlers,
      readOnly: true,
    });

    const callTool = getCallToolHandler(server);
    await callTool(
      { method: 'tools/call', params: { name: 'get_resource', arguments: { deviceId: 123 } } },
      { requestId: '1' },
    );

    expect(handleToolCall).toHaveBeenCalledWith('get_resource', { deviceId: 123 }, undefined);
  });

  it('allows a write tool call when readOnly is false (default, unchanged behavior)', async () => {
    const handleToolCall = jest.fn(async (..._args: any[]) => ({ acked: true }));
    const lmHandlers: any = { handleToolCall, formatResponse: jest.fn(() => '{}') };

    const { server } = createServer({
      version: '1.0.0',
      tools: getLogicMonitorTools(),
      lmHandlers,
    });

    const callTool = getCallToolHandler(server);
    await callTool(
      { method: 'tools/call', params: { name: 'acknowledge_alert', arguments: { alertId: 'DS1', ackComment: 'test' } } },
      { requestId: '1' },
    );

    expect(handleToolCall).toHaveBeenCalledWith(
      'acknowledge_alert',
      { alertId: 'DS1', ackComment: 'test' },
      undefined,
    );
  });
});
