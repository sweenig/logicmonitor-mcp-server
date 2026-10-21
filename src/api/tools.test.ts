/**
 * Tests for LogicMonitor MCP Tools
 */

import { describe, it, expect } from '@jest/globals';
import { getLogicMonitorTools } from './tools.js';

describe('getLogicMonitorTools', () => {
  describe('All Tools', () => {
    it('should return all tools when onlyReadOnly is false', () => {
      const tools = getLogicMonitorTools(false);

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return all tools when onlyReadOnly is not specified', () => {
      const tools = getLogicMonitorTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include both read-only and write tools', () => {
      const tools = getLogicMonitorTools(false);

      const hasReadOnly = tools.some(tool => tool.annotations?.readOnlyHint === true);
      const hasWrite = tools.some(tool => tool.annotations?.readOnlyHint === false);

      expect(hasReadOnly).toBe(true);
      expect(hasWrite).toBe(true);
    });
  });

  describe('Read-Only Tools', () => {
    it('should return only read-only tools when onlyReadOnly is true', () => {
      const tools = getLogicMonitorTools(true);

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // All tools should have readOnlyHint: true
      tools.forEach(tool => {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      });
    });

    it('should exclude write tools when filtering by read-only', () => {
      const allTools = getLogicMonitorTools(false);
      const readOnlyTools = getLogicMonitorTools(true);

      expect(readOnlyTools.length).toBeLessThan(allTools.length);
    });

    it('should not include create/update/delete tools in read-only mode', () => {
      const readOnlyTools = getLogicMonitorTools(true);

      const toolNames = readOnlyTools.map(tool => tool.name);

      // These tools should not be in read-only mode
      expect(toolNames).not.toContain('create_resource');
      expect(toolNames).not.toContain('update_resource');
      expect(toolNames).not.toContain('delete_resource');
      expect(toolNames).not.toContain('create_resource_group');
      expect(toolNames).not.toContain('update_resource_group');
      expect(toolNames).not.toContain('delete_resource_group');
      expect(toolNames).not.toContain('delete_resource_property');
      expect(toolNames).not.toContain('delete_resource_group_property');
    });

    it('should include list/get tools in read-only mode', () => {
      const readOnlyTools = getLogicMonitorTools(true);

      const toolNames = readOnlyTools.map(tool => tool.name);

      // These tools should be in read-only mode
      expect(toolNames).toContain('list_resources');
      expect(toolNames).toContain('get_resource');
      expect(toolNames).toContain('list_alerts');
      expect(toolNames).toContain('get_alert');
      expect(toolNames).toContain('list_collectors');
      expect(toolNames).toContain('get_collector');
    });
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure for all tools', () => {
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        // Each tool must have a name
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);

        // Each tool must have a description
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');

        // Each tool should have inputSchema
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');

        // Each tool should have annotations
        expect(tool.annotations).toBeDefined();
        expect(tool.annotations?.readOnlyHint).toBeDefined();
        expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
      });
    });

    it('should have unique tool names', () => {
      const tools = getLogicMonitorTools(false);
      const names = tools.map(tool => tool.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have valid inputSchema with properties', () => {
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');

        if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
          // If there are required fields, they must be in properties
          const properties = tool.inputSchema.properties || {};
          tool.inputSchema.required.forEach(requiredField => {
            expect(properties).toHaveProperty(requiredField);
          });
        }
      });
    });

    it('should have additionalProperties set to false', () => {
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        // All tools should have additionalProperties: false for strict validation
        expect(tool.inputSchema.additionalProperties).toBe(false);
      });
    });
  });

  describe('Specific Tool Categories', () => {
    describe('Device Management Tools', () => {
      it('should include device management tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_resources');
        expect(toolNames).toContain('get_resource');
        expect(toolNames).toContain('create_resource');
        expect(toolNames).toContain('update_resource');
        expect(toolNames).toContain('delete_resource');
      });

      it('should have correct read-only hints for device tools', () => {
        const tools = getLogicMonitorTools(false);

        const listTool = tools.find(t => t.name === 'list_resources');
        const getTool = tools.find(t => t.name === 'get_resource');
        const createTool = tools.find(t => t.name === 'create_resource');
        const updateTool = tools.find(t => t.name === 'update_resource');
        const deleteTool = tools.find(t => t.name === 'delete_resource');

        expect(listTool?.annotations?.readOnlyHint).toBe(true);
        expect(getTool?.annotations?.readOnlyHint).toBe(true);
        expect(createTool?.annotations?.readOnlyHint).toBe(false);
        expect(updateTool?.annotations?.readOnlyHint).toBe(false);
        expect(deleteTool?.annotations?.readOnlyHint).toBe(false);
      });
    });

    describe('Alert Management Tools', () => {
      it('should include alert management tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_alerts');
        expect(toolNames).toContain('get_alert');
        expect(toolNames).toContain('acknowledge_alert');
        expect(toolNames).toContain('add_alert_note');
      });

      it('should have correct read-only hints for alert tools', () => {
        const tools = getLogicMonitorTools(false);

        const listTool = tools.find(t => t.name === 'list_alerts');
        const getTool = tools.find(t => t.name === 'get_alert');
        const ackTool = tools.find(t => t.name === 'acknowledge_alert');

        expect(listTool?.annotations?.readOnlyHint).toBe(true);
        expect(getTool?.annotations?.readOnlyHint).toBe(true);
        expect(ackTool?.annotations?.readOnlyHint).toBe(false);
      });
    });

    describe('Dashboard Tools', () => {
      it('should include dashboard tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_dashboards');
        expect(toolNames).toContain('get_dashboard');
        expect(toolNames).toContain('create_dashboard');
        expect(toolNames).toContain('update_dashboard');
        expect(toolNames).toContain('delete_dashboard');
      });
    });

    describe('Collector Tools', () => {
      it('should include collector tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_collectors');
        expect(toolNames).toContain('get_collector');
        expect(toolNames).toContain('update_collector');
        expect(toolNames).toContain('delete_collector');
      });

      it('should mark read-only collector tools as read-only', () => {
        const tools = getLogicMonitorTools(false);

        const listTool = tools.find(t => t.name === 'list_collectors');
        const getTool = tools.find(t => t.name === 'get_collector');

        expect(listTool?.annotations?.readOnlyHint).toBe(true);
        expect(getTool?.annotations?.readOnlyHint).toBe(true);
      });

      it('should mark collector write tools as read-write', () => {
        const tools = getLogicMonitorTools(false);

        const updateTool = tools.find(t => t.name === 'update_collector');
        const deleteTool = tools.find(t => t.name === 'delete_collector');

        expect(updateTool?.annotations?.readOnlyHint).toBe(false);
        expect(deleteTool?.annotations?.readOnlyHint).toBe(false);
      });

      it('should exclude collector write tools from read-only tool list', () => {
        const readOnlyTools = getLogicMonitorTools(true);
        const toolNames = readOnlyTools.map(tool => tool.name);

        expect(toolNames).not.toContain('update_collector');
        expect(toolNames).not.toContain('delete_collector');
      });

      it('should require collectorId for update_collector and delete_collector', () => {
        const tools = getLogicMonitorTools(false);

        const updateTool = tools.find(t => t.name === 'update_collector');
        const deleteTool = tools.find(t => t.name === 'delete_collector');

        expect(updateTool?.inputSchema.required).toContain('collectorId');
        expect(deleteTool?.inputSchema.required).toContain('collectorId');
      });

      it('should support customProperties and opType in update_collector', () => {
        const tools = getLogicMonitorTools(false);
        const updateTool = tools.find(t => t.name === 'update_collector');

        const properties = updateTool?.inputSchema.properties || {};
        expect(properties).toHaveProperty('customProperties');
        expect(properties).toHaveProperty('opType');
      });
    });

    describe('Debug Command Tools', () => {
      it('should include debug command tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('execute_debug_command');
        expect(toolNames).toContain('get_debug_command_result');
      });

      it('should mark debug command tools as read-write', () => {
        const tools = getLogicMonitorTools(false);

        const executeTool = tools.find(t => t.name === 'execute_debug_command');
        const getResultTool = tools.find(t => t.name === 'get_debug_command_result');

        expect(executeTool?.annotations?.readOnlyHint).toBe(false);
        expect(getResultTool?.annotations?.readOnlyHint).toBe(false);
      });

      it('should exclude debug command tools from read-only tool list', () => {
        const readOnlyTools = getLogicMonitorTools(true);
        const toolNames = readOnlyTools.map(t => t.name);

        expect(toolNames).not.toContain('execute_debug_command');
        expect(toolNames).not.toContain('get_debug_command_result');
      });

      it('should require collectorId and cmdline for execute_debug_command', () => {
        const tools = getLogicMonitorTools(false);
        const executeTool = tools.find(t => t.name === 'execute_debug_command');

        expect(executeTool?.inputSchema.required).toEqual(['collectorId', 'cmdline']);
      });

      it('should require id and collectorId for get_debug_command_result', () => {
        const tools = getLogicMonitorTools(false);
        const getResultTool = tools.find(t => t.name === 'get_debug_command_result');

        expect(getResultTool?.inputSchema.required).toEqual(['id', 'collectorId']);
      });

      it('should expose schedule_resource_discovery as a read-only tool requiring deviceId', () => {
        const allTools = getLogicMonitorTools(false);
        const readOnlyTools = getLogicMonitorTools(true);
        const tool = allTools.find(t => t.name === 'schedule_resource_discovery');

        expect(tool?.annotations?.readOnlyHint).toBe(true);
        expect(tool?.inputSchema.required).toEqual(['deviceId']);
        expect(readOnlyTools.map(t => t.name)).toContain('schedule_resource_discovery');
      });

      it('should include typed script execution tools as read-write', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('execute_groovy_script');
        expect(toolNames).toContain('execute_powershell_script');

        const groovyTool = tools.find(t => t.name === 'execute_groovy_script');
        const poshTool = tools.find(t => t.name === 'execute_powershell_script');

        expect(groovyTool?.annotations?.readOnlyHint).toBe(false);
        expect(poshTool?.annotations?.readOnlyHint).toBe(false);
        expect(groovyTool?.inputSchema.required).toEqual(['collectorId']);
        expect(poshTool?.inputSchema.required).toEqual(['collectorId', 'scriptPath']);
      });
    });

    describe('List Tools with Query Parameter', () => {
      it('should have query parameter in list tools', () => {
        const tools = getLogicMonitorTools(false);

        const listResources = tools.find(t => t.name === 'list_resources');
        const listAlerts = tools.find(t => t.name === 'list_alerts');
        const listAuditLogs = tools.find(t => t.name === 'list_audit_logs');

        expect(listResources?.inputSchema?.properties).toHaveProperty('query');
        expect(listAlerts?.inputSchema?.properties).toHaveProperty('query');
        expect(listAuditLogs?.inputSchema?.properties).toHaveProperty('query');
      });

      it('should mark list tools as read-only', () => {
        const tools = getLogicMonitorTools(false);

        const listResources = tools.find(t => t.name === 'list_resources');
        const listAlerts = tools.find(t => t.name === 'list_alerts');

        expect(listResources?.annotations?.readOnlyHint).toBe(true);
        expect(listAlerts?.annotations?.readOnlyHint).toBe(true);
      });
    });

    describe('SDT Tools', () => {
      it('should include SDT tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_sdts');
        expect(toolNames).toContain('get_sdt');
        expect(toolNames).toContain('create_resource_sdt');
        expect(toolNames).toContain('delete_sdt');
      });

      it('should have correct read-only hints for SDT tools', () => {
        const tools = getLogicMonitorTools(false);

        const listTool = tools.find(t => t.name === 'list_sdts');
        const getTool = tools.find(t => t.name === 'get_sdt');
        const createTool = tools.find(t => t.name === 'create_resource_sdt');
        const deleteTool = tools.find(t => t.name === 'delete_sdt');

        expect(listTool?.annotations?.readOnlyHint).toBe(true);
        expect(getTool?.annotations?.readOnlyHint).toBe(true);
        expect(createTool?.annotations?.readOnlyHint).toBe(false);
        expect(deleteTool?.annotations?.readOnlyHint).toBe(false);
      });
    });

    describe('User and Role Tools', () => {
      it('should include user and role tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_users');
        expect(toolNames).toContain('get_user');
        expect(toolNames).toContain('list_roles');
        expect(toolNames).toContain('get_role');
      });

      it('should mark user/role tools as read-only', () => {
        const tools = getLogicMonitorTools(false);

        const listUsers = tools.find(t => t.name === 'list_users');
        const getUser = tools.find(t => t.name === 'get_user');
        const listRoles = tools.find(t => t.name === 'list_roles');
        const getRole = tools.find(t => t.name === 'get_role');

        expect(listUsers?.annotations?.readOnlyHint).toBe(true);
        expect(getUser?.annotations?.readOnlyHint).toBe(true);
        expect(listRoles?.annotations?.readOnlyHint).toBe(true);
        expect(getRole?.annotations?.readOnlyHint).toBe(true);
      });
    });

    describe('Website Tools', () => {
      it('should include website tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_websites');
        expect(toolNames).toContain('get_website');
        expect(toolNames).toContain('create_website');
        expect(toolNames).toContain('update_website');
        expect(toolNames).toContain('delete_website');
      });
    });

    describe('Link Tools', () => {
      it('should include link generation tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('generate_dashboard_link');
        expect(toolNames).toContain('generate_resource_link');
        expect(toolNames).toContain('generate_alert_link');
        expect(toolNames).toContain('generate_website_link');
      });

      it('should mark link tools as read-only', () => {
        const tools = getLogicMonitorTools(false);

        const dashboardLink = tools.find(t => t.name === 'generate_dashboard_link');
        const resourceLink = tools.find(t => t.name === 'generate_resource_link');
        const alertLink = tools.find(t => t.name === 'generate_alert_link');
        const websiteLink = tools.find(t => t.name === 'generate_website_link');

        expect(dashboardLink?.annotations?.readOnlyHint).toBe(true);
        expect(resourceLink?.annotations?.readOnlyHint).toBe(true);
        expect(alertLink?.annotations?.readOnlyHint).toBe(true);
        expect(websiteLink?.annotations?.readOnlyHint).toBe(true);
      });
    });

    describe('DataSource Tools', () => {
      it('should include datasource tools', () => {
        const tools = getLogicMonitorTools(false);
        const toolNames = tools.map(t => t.name);

        expect(toolNames).toContain('list_datasources');
        expect(toolNames).toContain('get_datasource');
        expect(toolNames).toContain('list_resource_instances');
        expect(toolNames).toContain('get_resource_instance_data');
      });

      it('should mark datasource query tools as read-only', () => {
        const tools = getLogicMonitorTools(false);

        const listDS = tools.find(t => t.name === 'list_datasources');
        const getDS = tools.find(t => t.name === 'get_datasource');
        const listInstances = tools.find(t => t.name === 'list_resource_instances');
        const getData = tools.find(t => t.name === 'get_resource_instance_data');

        expect(listDS?.annotations?.readOnlyHint).toBe(true);
        expect(getDS?.annotations?.readOnlyHint).toBe(true);
        expect(listInstances?.annotations?.readOnlyHint).toBe(true);
        expect(getData?.annotations?.readOnlyHint).toBe(true);
      });

      it('should include datasource management tools with correct read-only classification', () => {
        const tools = getLogicMonitorTools(false);

        const getScripts = tools.find(t => t.name === 'get_datasource_scripts');
        const createDS = tools.find(t => t.name === 'create_datasource');
        const updateDS = tools.find(t => t.name === 'update_datasource');
        const deleteDS = tools.find(t => t.name === 'delete_datasource');

        expect(getScripts?.annotations?.readOnlyHint).toBe(true);
        expect(createDS?.annotations?.readOnlyHint).toBe(false);
        expect(updateDS?.annotations?.readOnlyHint).toBe(false);
        expect(deleteDS?.annotations?.readOnlyHint).toBe(false);

        expect(getScripts?.inputSchema.required).toEqual(['dataSourceId']);
        expect(createDS?.inputSchema.required).toEqual(['name', 'displayName', 'collectMethod', 'collectInterval', 'collectorAttribute']);
        expect(updateDS?.inputSchema.required).toEqual(['dataSourceId']);
        expect(deleteDS?.inputSchema.required).toEqual(['dataSourceId']);
      });

      it('should include configsource management tools with correct read-only classification', () => {
        const tools = getLogicMonitorTools(false);
        const names = ['get_configsource_scripts', 'update_configsource', 'delete_configsource'];
        const [getScripts, updateCS, deleteCS] = names.map(n => tools.find(t => t.name === n));

        expect(getScripts?.annotations?.readOnlyHint).toBe(true);
        expect(updateCS?.annotations?.readOnlyHint).toBe(false);
        expect(deleteCS?.annotations?.readOnlyHint).toBe(false);
        [getScripts, updateCS, deleteCS].forEach(t => expect(t?.inputSchema.required).toEqual(['configSourceId']));

        // hasMultiInstances is create-only, so update must not accept it but must document why
        expect((updateCS?.inputSchema.properties as any).hasMultiInstances).toBeUndefined();
        expect(updateCS?.description).toContain('hasMultiInstances');
        expect((updateCS?.inputSchema.properties as any).configChecks.type).toBe('array');
        expect(updateCS?.description).toContain('REPLACEMENT');
        expect(updateCS?.description).toContain('ignore_line_with_regex');

        // read-only servers must not advertise the write tools
        const ro = getLogicMonitorTools(true).map(t => t.name);
        expect(ro).toContain('get_configsource_scripts');
        expect(ro).not.toContain('update_configsource');
        expect(ro).not.toContain('delete_configsource');
      });

      it('should document hasMultiInstances on create_datasource and its create-only limit on update_datasource', () => {
        const tools = getLogicMonitorTools(false);
        const createDS = tools.find(t => t.name === 'create_datasource');
        const updateDS = tools.find(t => t.name === 'update_datasource');

        expect((createDS?.inputSchema.properties as any).hasMultiInstances.type).toBe('boolean');
        expect((updateDS?.inputSchema.properties as any).hasMultiInstances).toBeUndefined();
        expect(updateDS?.description).toContain('hasMultiInstances');
      });
    });
  });

  describe('Tool Descriptions', () => {
    it('should have non-empty descriptions for all tools', () => {
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.description!.length).toBeGreaterThan(10);
      });
    });

    it('should mention LogicMonitor or LM in most descriptions', () => {
      const tools = getLogicMonitorTools(false);

      // Count how many tools mention LogicMonitor or LM
      const toolsWithLM = tools.filter(tool => {
        const desc = tool.description?.toLowerCase() || '';
        return desc.includes('logicmonitor') || desc.includes('lm');
      });

      // At least 80% of tools should mention LogicMonitor or LM
      const percentage = (toolsWithLM.length / tools.length) * 100;
      expect(percentage).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Input Schema Properties', () => {
    it('should have pagination parameters for list tools', () => {
      const tools = getLogicMonitorTools(false);
      const listTools = tools.filter(t => t.name.startsWith('list_'));

      listTools.forEach(tool => {
        const properties = tool.inputSchema.properties || {};

        // Most list tools should have pagination
        if (tool.name !== 'list_website_checkpoints') { // Some exceptions
          expect(properties).toHaveProperty('size');
          expect(properties).toHaveProperty('offset');
        }
      });
    });

    it('should have filter parameter for list tools', () => {
      const tools = getLogicMonitorTools(false);
      const listTools = tools.filter(t => t.name.startsWith('list_'));

      listTools.forEach(tool => {
        const properties = tool.inputSchema.properties || {};

        // Most list tools should have filter (some exceptions exist)
        if (tool.name !== 'list_website_checkpoints' &&
            tool.name !== 'list_collector_versions') {
          expect(properties).toHaveProperty('filter');
        }
      });
    });

    it('should have ID parameter for get/update/delete tools', () => {
      const tools = getLogicMonitorTools(false);
      const idTools = tools.filter(t =>
        t.name.startsWith('get_') ||
        t.name.startsWith('update_') ||
        t.name.startsWith('delete_'),
      );

      // Count tools that have ID parameters
      const toolsWithId = idTools.filter(tool => {
        const required = tool.inputSchema.required || [];
        const properties = tool.inputSchema.properties || {};

        // Should have at least one ID parameter in required or properties
        return required.some(r =>
          r.toLowerCase().includes('id'),
        ) || Object.keys(properties).some(p =>
          p.toLowerCase().includes('id'),
        );
      });

      // Most get/update/delete tools should have an ID parameter
      const percentage = (toolsWithId.length / idTools.length) * 100;
      expect(percentage).toBeGreaterThanOrEqual(90);
    });

    it('should have required parameters for create tools', () => {
      const tools = getLogicMonitorTools(false);
      const createTools = tools.filter(t => t.name.startsWith('create_'));

      createTools.forEach(tool => {
        // Create tools should typically have required fields
        if (tool.inputSchema.required) {
          expect(tool.inputSchema.required.length).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });

  describe('Annotations', () => {
    it('should have title annotation for all tools', () => {
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        expect(tool.annotations?.title).toBeDefined();
        expect(typeof tool.annotations?.title).toBe('string');
      });
    });
  });

  describe('Tool Count', () => {
    it('should have a reasonable number of tools', () => {
      const allTools = getLogicMonitorTools(false);

      // Should have at least 50 tools (comprehensive API coverage)
      expect(allTools.length).toBeGreaterThanOrEqual(50);

      // Should have fewer than 200 tools (reasonable upper bound)
      expect(allTools.length).toBeLessThan(200);
    });

    it('should have at least 30% read-only tools', () => {
      const allTools = getLogicMonitorTools(false);
      const readOnlyTools = getLogicMonitorTools(true);

      const readOnlyPercentage = (readOnlyTools.length / allTools.length) * 100;

      expect(readOnlyPercentage).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Batch Operation Support', () => {
    it('should have batch parameters in create_resource tool', () => {
      const tools = getLogicMonitorTools(false);
      const createResource = tools.find(t => t.name === 'create_resource');

      expect(createResource).toBeDefined();
      const properties = createResource?.inputSchema.properties || {};

      // Should support batch operations
      expect(properties).toHaveProperty('devices');
      expect(properties).toHaveProperty('batchOptions');
    });

    it('should have batch parameters in update_resource tool', () => {
      const tools = getLogicMonitorTools(false);
      const updateResource = tools.find(t => t.name === 'update_resource');

      expect(updateResource).toBeDefined();
      const properties = updateResource?.inputSchema.properties || {};

      // Should support batch operations
      expect(properties).toHaveProperty('devices');
      expect(properties).toHaveProperty('batchOptions');
    });

    it('should have batch parameters in delete_resource tool', () => {
      const tools = getLogicMonitorTools(false);
      const deleteResource = tools.find(t => t.name === 'delete_resource');

      expect(deleteResource).toBeDefined();
      const properties = deleteResource?.inputSchema.properties || {};

      // Should support batch operations
      expect(properties).toHaveProperty('deviceIds');
      expect(properties).toHaveProperty('batchOptions');
    });
  });

  describe('Field Selection Support', () => {
    it('should support fields parameter in list tools', () => {
      const tools = getLogicMonitorTools(false);
      const listTools = tools.filter(t => t.name.startsWith('list_'));

      listTools.forEach(tool => {
        const properties = tool.inputSchema.properties || {};

        // Most list tools should support fields parameter
        if (tool.name !== 'list_website_checkpoints') {
          expect(properties).toHaveProperty('fields');
        }
      });
    });

    it('should support fields parameter in get tools', () => {
      const tools = getLogicMonitorTools(false);
      const getTools = tools.filter(t => t.name.startsWith('get_'));

      getTools.forEach(tool => {
        const properties = tool.inputSchema.properties || {};

        // Most get tools should support fields parameter
        if (tool.name !== 'get_resource_instance_data' &&
            tool.name !== 'get_topology' &&
            tool.name !== 'get_widget_data' &&
            tool.name !== 'get_debug_command_result' &&
            tool.name !== 'get_datasource_scripts' &&
            tool.name !== 'get_configsource_scripts' &&
            tool.name !== 'get_resource_group_datasource_thresholds') {
          expect(properties).toHaveProperty('fields');
        }
      });
    });
  });

  describe('time parameter documentation', () => {
    it('states the epoch unit for every start/end style parameter', () => {
      const timeProps = ['start', 'end', 'startDateTime', 'endDateTime'];
      const tools = getLogicMonitorTools(false);

      tools.forEach(tool => {
        const properties: Record<string, any> = tool.inputSchema.properties || {};
        timeProps.forEach(name => {
          if (properties[name]) {
            expect({ tool: tool.name, param: name, documented: /seconds|milliseconds/i.test(properties[name].description || '') })
              .toEqual({ tool: tool.name, param: name, documented: true });
          }
        });
      });
    });
  });
});
describe('tool descriptions', () => {
  it('only reference tools that exist', () => {
    const tools = getLogicMonitorTools(false);
    const names = new Set(tools.map(tool => tool.name));
    // Quoted snake_case words in descriptions that are not tool names (LogicMonitor discovery method names).
    const notTools = new Set(['ad_script']);

    const unknown: string[] = [];
    for (const tool of tools) {
      // Descriptions escape underscores for markdown ("list\_resources"), so strip the backslashes first.
      for (const match of (tool.description ?? '').matchAll(/"([a-z]+(?:\\?_[a-z]+)+)"/g)) {
        const referenced = match[1].replace(/\\/g, '');
        if (!names.has(referenced) && !notTools.has(referenced)) {
          unknown.push(`${tool.name} -> ${referenced}`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  it('describe collector health with the real fields, not alive/dead or heartbeat fields', () => {
    const tools = getLogicMonitorTools(false);
    const text = ['list_collectors', 'get_collector']
      .map(name => tools.find(tool => tool.name === name)?.description ?? '')
      .join('\n');

    // status is a registration number; the API has no "alive" value, so this filter silently matches nothing.
    expect(text).not.toMatch(/status:\\?"?alive/);
    // These are not fields of the collector object.
    expect(text).not.toContain('lastHeartbeatTime');
    expect(text).not.toContain('freeDiskSpace');
    // The fields that do tell up/down state and where the collector host lives.
    expect(text).toContain('isDown');
    expect(text).toContain('collectorDeviceId');
  });
});

describe('returnFull option on create and update tools', () => {
  const tools = getLogicMonitorTools(false);

  it('is offered on every create_ and update_ tool and nowhere else', () => {
    const withOption = tools.filter(t => (t.inputSchema.properties as any)?.returnFull).map(t => t.name);
    const expected = tools.filter(t => /^(create|update)_/.test(t.name)).map(t => t.name);
    expect(withOption.sort()).toEqual(expected.sort());
    expect(expected.length).toBeGreaterThan(20);
  });

  it('is a boolean that is never required, and the description explains it', () => {
    const tool = tools.find(t => t.name === 'update_datasource')!;
    expect((tool.inputSchema.properties as any).returnFull.type).toBe('boolean');
    expect(tool.inputSchema.required ?? []).not.toContain('returnFull');
    expect(tool.description).toContain('returnFull');
  });
});

describe('parameter names in descriptions match the input schemas', () => {
  // Bullets in a "Parameters" section that are fields of a nested object (a step, a datapoint config), not top-level arguments.
  const NESTED_FIELD_SECTIONS: Record<string, string[]> = {
    create_uptime_check: ['url', 'HTTPMethod', 'matchType', 'keyword', 'invertMatch', 'statusCode', 'timeout', 'followRedirection'],
    update_resource_group_datasource_thresholds: ['alertExpr', 'disableAlerting'],
  };

  function documentedParameters(description: string): string[] {
    const found = new Set<string>();
    const parts = description.split(/(\*\*[^*\n]*\*\*)/);
    let section: string | null = null;
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        section = part.replace(/\*/g, '').toLowerCase();
        continue;
      }
      if (section && section.includes('parameters') && !section.includes('return')) {
        for (const match of part.matchAll(/^\s*[-•]\s*`?\\?([A-Za-z_][\w.]*)`?\s*(?:\(|:|\*)/gm)) {
          found.add(match[1].replace(/\\/g, ''));
        }
      }
    }
    return [...found];
  }

  it('documents only parameters the tool accepts, unless the description says they are not supported yet', () => {
    const problems: string[] = [];
    for (const tool of getLogicMonitorTools(false)) {
      const accepted = new Set(Object.keys((tool.inputSchema.properties as any) ?? {}));
      const notSupported = /\*\*Not supported yet:\*\*([^.]*)\./.exec(tool.description ?? '')?.[1] ?? '';
      for (const name of documentedParameters(tool.description ?? '')) {
        if (accepted.has(name)) continue;
        if (new RegExp(`\\b${name}\\b`).test(notSupported)) continue;
        if (NESTED_FIELD_SECTIONS[tool.name]?.includes(name)) continue;
        problems.push(`${tool.name}: ${name}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('never lists a "Not supported yet" parameter that the tool does accept', () => {
    const stale: string[] = [];
    for (const tool of getLogicMonitorTools(false)) {
      const accepted = new Set(Object.keys((tool.inputSchema.properties as any) ?? {}));
      const note = /\*\*Not supported yet:\*\*([^.]*)\./.exec(tool.description ?? '')?.[1];
      if (!note) continue;
      for (const name of accepted) {
        if (new RegExp(`\\b${name}\\b`).test(note)) stale.push(`${tool.name}: ${name}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe('create_datasource required fields', () => {
  it('requires displayName, which the LogicMonitor API rejects a request without', () => {
    const tool = getLogicMonitorTools(false).find(t => t.name === 'create_datasource')!;
    expect(tool.inputSchema.required).toContain('displayName');
  });
});

describe('report tool descriptions', () => {
  const tools = getLogicMonitorTools(false);
  const text = (name: string) => tools.find(t => t.name === name)!.description!;

  it('tell callers to find the reports in a group through the reports groupId', () => {
    expect(text('list_reports')).toContain('groupId');
    expect(text('list_report_groups')).toContain('groupId:<id>');
    expect(text('get_report_group')).toContain('groupId:<id>');
  });

  it('describe report groups as flat, without a parentId or subgroups', () => {
    for (const name of ['list_report_groups', 'get_report_group', 'create_report_group', 'update_report_group']) {
      expect(text(name)).not.toMatch(/parentId|number of subgroups/);
    }
    expect(text('list_report_groups')).toContain('flat');
  });
});
