/**
 * Tests for LogicMonitor API Handlers
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LogicMonitorHandlers, looksLikePermissionDenial } from './handlers.js';
import { LogicMonitorClient } from './client.js';
import { LogicMonitorApiError } from '../utils/core/lm-error.js';
import { MCPError } from '../utils/core/error-handler.js';

// Mock the client
jest.mock('./client.js');
jest.mock('../utils/helpers/batch-processor.js');

describe('LogicMonitorHandlers', () => {
  let handlers: LogicMonitorHandlers;
  let mockClient: jest.Mocked<LogicMonitorClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock client
    mockClient = {
      listResources: jest.fn(),
      getDevice: jest.fn(),
      createDevice: jest.fn(),
      updateDevice: jest.fn(),
      deleteDevice: jest.fn(),
      listDeviceGroups: jest.fn(),
      getDeviceGroup: jest.fn(),
      createDeviceGroup: jest.fn(),
      updateDeviceGroup: jest.fn(),
      deleteDeviceGroup: jest.fn(),
      listAlerts: jest.fn(),
      getAlert: jest.fn(),
      acknowledgeAlert: jest.fn(),
      addAlertNote: jest.fn(),
      listCollectors: jest.fn(),
      getCollector: jest.fn(),
      updateCollector: jest.fn(),
      deleteCollector: jest.fn(),
      executeDebugCommand: jest.fn(),
      getDebugCommandResult: jest.fn(),
      listDataSources: jest.fn(),
      getDataSource: jest.fn(),
      listDataSourceOverviewGraphs: jest.fn(),
      getDataSourceOverviewGraph: jest.fn(),
      listDataSourceGraphs: jest.fn(),
      getDataSourceGraph: jest.fn(),
      createDataSourceOverviewGraph: jest.fn(),
      updateDataSourceOverviewGraph: jest.fn(),
      deleteDataSourceOverviewGraph: jest.fn(),
      createDataSourceGraph: jest.fn(),
      updateDataSourceGraph: jest.fn(),
      deleteDataSourceGraph: jest.fn(),
      createDataSource: jest.fn(),
      updateDataSource: jest.fn(),
      deleteDataSource: jest.fn(),
      listDeviceDataSourceInstances: jest.fn(),
      getDeviceDataSourceInstanceData: jest.fn(),
      listDashboards: jest.fn(),
      getDashboard: jest.fn(),
      createDashboard: jest.fn(),
      updateDashboard: jest.fn(),
      deleteDashboard: jest.fn(),
      generateDashboardLink: jest.fn(),
      listWidgets: jest.fn(),
      getWidget: jest.fn(),
      createWidget: jest.fn(),
      updateWidget: jest.fn(),
      deleteWidget: jest.fn(),
      getWidgetData: jest.fn(),
      generateResourceLink: jest.fn(),
      generateAlertLink: jest.fn(),
      generateWebsiteLink: jest.fn(),
      listDashboardGroups: jest.fn(),
      getDashboardGroup: jest.fn(),
      listReports: jest.fn(),
      getReport: jest.fn(),
      listWebsites: jest.fn(),
      getWebsite: jest.fn(),
      createWebsite: jest.fn(),
      updateWebsite: jest.fn(),
      deleteWebsite: jest.fn(),
      listWebsiteGroups: jest.fn(),
      createWebsiteGroup: jest.fn(),
      updateWebsiteGroup: jest.fn(),
      deleteWebsiteGroup: jest.fn(),
      listWebsiteGroupWebsites: jest.fn(),
      listWebsiteGroupSdts: jest.fn(),
      listWebsiteAlerts: jest.fn(),
      listWebsiteProperties: jest.fn(),
      listWebsiteSdts: jest.fn(),
      listNetscanGroups: jest.fn(),
      createNetscanGroup: jest.fn(),
      updateNetscanGroup: jest.fn(),
      deleteNetscanGroup: jest.fn(),
      getWebsiteCheckpointData: jest.fn(),
      getWebsiteGroup: jest.fn(),
      listUsers: jest.fn(),
      getUser: jest.fn(),
      listRoles: jest.fn(),
      getRole: jest.fn(),
      listApiTokens: jest.fn(),
      listSDTs: jest.fn(),
      getSDT: jest.fn(),
      createDeviceSDT: jest.fn(),
      deleteSDT: jest.fn(),
      listConfigSources: jest.fn(),
      getConfigSource: jest.fn(),
      createConfigSource: jest.fn(),
      updateConfigSource: jest.fn(),
      deleteConfigSource: jest.fn(),
      listPropertySources: jest.fn(),
      getPropertySource: jest.fn(),
      listDeviceProperties: jest.fn(),
      updateDeviceProperty: jest.fn(),
      deleteDeviceProperty: jest.fn(),
      scheduleDeviceDiscovery: jest.fn(),
      listAuditLogs: jest.fn(),
      getAuditLog: jest.fn(),
      listIntegrationLogs: jest.fn(),
      listAccessGroups: jest.fn(),
      getAccessGroup: jest.fn(),
      createAccessGroup: jest.fn(),
      updateAccessGroup: jest.fn(),
      deleteAccessGroup: jest.fn(),
      listDeviceDataSources: jest.fn(),
      getDeviceDataSource: jest.fn(),
      updateDeviceDataSource: jest.fn(),
      listEventSources: jest.fn(),
      getEventSource: jest.fn(),
      listEscalationChains: jest.fn(),
      getEscalationChain: jest.fn(),
      createEscalationChain: jest.fn(),
      updateEscalationChain: jest.fn(),
      deleteEscalationChain: jest.fn(),
      listRecipients: jest.fn(),
      getRecipient: jest.fn(),
      createRecipient: jest.fn(),
      updateRecipient: jest.fn(),
      deleteRecipient: jest.fn(),
      listRecipientGroups: jest.fn(),
      getRecipientGroup: jest.fn(),
      createRecipientGroup: jest.fn(),
      updateRecipientGroup: jest.fn(),
      deleteRecipientGroup: jest.fn(),
      listAlertRules: jest.fn(),
      getAlertRule: jest.fn(),
      createAlertRule: jest.fn(),
      updateAlertRule: jest.fn(),
      deleteAlertRule: jest.fn(),
      listOpsNotes: jest.fn(),
      getOpsNote: jest.fn(),
      createOpsNote: jest.fn(),
      updateOpsNote: jest.fn(),
      deleteOpsNote: jest.fn(),
      listReportGroups: jest.fn(),
      getReportGroup: jest.fn(),
      createReportGroup: jest.fn(),
      updateReportGroup: jest.fn(),
      deleteReportGroup: jest.fn(),
      listCollectorGroups: jest.fn(),
      getCollectorGroup: jest.fn(),
      deleteCollectorGroup: jest.fn(),
      updateCollectorGroup: jest.fn(),
      listDeviceGroupProperties: jest.fn(),
      updateDeviceGroupProperty: jest.fn(),
      deleteDeviceGroupProperty: jest.fn(),
      listDeviceGroupDataSources: jest.fn(),
      getDeviceGroupDataSourceAlertSettings: jest.fn(),
      updateDeviceGroupDataSourceAlertSettings: jest.fn(),
      listNetscans: jest.fn(),
      getNetscan: jest.fn(),
      createNetscan: jest.fn(),
      updateNetscan: jest.fn(),
      deleteNetscan: jest.fn(),
      listIntegrations: jest.fn(),
      getIntegration: jest.fn(),
      createIntegration: jest.fn(),
      updateIntegration: jest.fn(),
      deleteIntegration: jest.fn(),
      listWebsiteCheckpoints: jest.fn(),
      getTopology: jest.fn(),
      listCollectorVersions: jest.fn(),
      listCollectorEvents: jest.fn(),
    } as unknown as jest.Mocked<LogicMonitorClient>;

    handlers = new LogicMonitorHandlers(mockClient);
  });

  describe('Device Management', () => {
    describe('list_resources', () => {
      it('should list devices with default curated fields', async () => {
        const mockResponse = {
          items: [
            {
              id: 1,
              displayName: 'test-device',
              name: 'test',
              hostStatus: 'normal',
              alertStatus: 'none',
              extraField: 'should-be-filtered',
            },
          ],
          total: 1,
        };

        mockClient.listResources.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_resources', {
          size: 10,
          offset: 0,
        });

        expect(mockClient.listResources).toHaveBeenCalledWith({
          size: 10,
          offset: 0,
          filter: undefined,
          fields: undefined,
          autoPaginate: undefined,
        });

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('displayName');
        expect(result.items[0]).toHaveProperty('hostStatus');
        expect(result.items[0]).not.toHaveProperty('extraField');
      });

      it('should list devices with custom fields when specified', async () => {
        const mockResponse = {
          items: [
            {
              id: 1,
              customField: 'custom-value',
            },
          ],
          total: 1,
        };

        mockClient.listResources.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_resources', {
          fields: 'id,customField',
        });

        expect(result).toEqual(mockResponse);
      });

      it('should list devices with filter', async () => {
        const mockResponse = { items: [], total: 0 };
        mockClient.listResources.mockResolvedValue(mockResponse);

        await handlers.handleToolCall('list_resources', {
          filter: 'displayName~*server*',
        });

        expect(mockClient.listResources).toHaveBeenCalledWith({
          size: undefined,
          offset: undefined,
          filter: 'displayName~*server*',
          fields: undefined,
          autoPaginate: undefined,
        });
      });

      it('should throw when combining query and filter (LM API cannot mix OR-expanded query with AND filter)', async () => {
        await expect(
          handlers.handleToolCall('list_resources', {
            query: 'prod',
            filter: 'hostStatus:normal',
          }),
        ).rejects.toThrow(MCPError);

        try {
          await handlers.handleToolCall('list_resources', {
            query: 'prod',
            filter: 'hostStatus:normal',
          });
          throw new Error('expected handleToolCall to throw');
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          const mcpError = error as MCPError;
          expect(mcpError.suggestions?.join('\n')).toContain('displayName~"*prod*",hostStatus:normal');
          expect(mcpError.suggestions?.join('\n')).toContain('description~"*prod*",hostStatus:normal');
          expect(mcpError.suggestions?.join('\n')).toContain('name~"*prod*",hostStatus:normal');
        }

        expect(mockClient.listResources).not.toHaveBeenCalled();
      });
    });

    describe('get_resource', () => {
      it('should get device by ID', async () => {
        const mockDevice = {
          id: 123,
          displayName: 'test-device',
          name: 'test',
        };

        mockClient.getDevice.mockResolvedValue(mockDevice);

        const result = await handlers.handleToolCall('get_resource', {
          deviceId: 123,
        });

        expect(result).toEqual(mockDevice);
        expect(mockClient.getDevice).toHaveBeenCalledWith(123, {
          fields: undefined,
        });
      });

      it('should get device with custom fields', async () => {
        const mockDevice = { id: 123, customField: 'value' };
        mockClient.getDevice.mockResolvedValue(mockDevice);

        await handlers.handleToolCall('get_resource', {
          deviceId: 123,
          fields: 'id,customField',
        });

        expect(mockClient.getDevice).toHaveBeenCalledWith(123, {
          fields: 'id,customField',
        });
      });
    });

    describe('create_resource', () => {
      it('should create a single device', async () => {
        const mockDevice = { id: 1, displayName: 'new-device' };
        mockClient.createDevice.mockResolvedValue(mockDevice);

        const result = await handlers.handleToolCall('create_resource', {
          displayName: 'new-device',
          name: 'new-device',
          preferredCollectorId: 1,
        });

        expect(result).toEqual(mockDevice);
        expect(mockClient.createDevice).toHaveBeenCalledWith({
          displayName: 'new-device',
          name: 'new-device',
          preferredCollectorId: 1,
        });
      });

      it('should create device with optional properties', async () => {
        const mockDevice = { id: 1, displayName: 'new-device' };
        mockClient.createDevice.mockResolvedValue(mockDevice);

        await handlers.handleToolCall('create_resource', {
          displayName: 'new-device',
          name: 'new-device',
          preferredCollectorId: 1,
          hostGroupIds: '1,2',
          description: 'Test device',
          disableAlerting: true,
          customProperties: [{ name: 'env', value: 'prod' }],
        });

        expect(mockClient.createDevice).toHaveBeenCalledWith({
          displayName: 'new-device',
          name: 'new-device',
          preferredCollectorId: 1,
          hostGroupIds: '1,2',
          description: 'Test device',
          disableAlerting: true,
          customProperties: [{ name: 'env', value: 'prod' }],
        });
      });
    });

    describe('update_resource', () => {
      it('should update device with replace opType', async () => {
        const mockDevice = { id: 1, displayName: 'updated-device' };
        mockClient.updateDevice.mockResolvedValue(mockDevice);

        const result = await handlers.handleToolCall('update_resource', {
          deviceId: 1,
          displayName: 'updated-device',
        });

        expect(result).toEqual(mockDevice);
        expect(mockClient.updateDevice).toHaveBeenCalledWith(
          1,
          { displayName: 'updated-device' },
          { opType: 'replace' },
        );
      });

      it('should update device with custom opType', async () => {
        const mockDevice = { id: 1, displayName: 'updated-device' };
        mockClient.updateDevice.mockResolvedValue(mockDevice);

        await handlers.handleToolCall('update_resource', {
          deviceId: 1,
          displayName: 'updated-device',
          opType: 'add',
        });

        expect(mockClient.updateDevice).toHaveBeenCalledWith(
          1,
          { displayName: 'updated-device' },
          { opType: 'add' },
        );
      });
    });

    describe('delete_resource', () => {
      it('should delete device', async () => {
        mockClient.deleteDevice.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_resource', {
          deviceId: 1,
        });

        expect(result).toEqual({});
        expect(mockClient.deleteDevice).toHaveBeenCalledWith(1, {
          deleteFromSystem: undefined,
        });
      });

      it('should delete device from system', async () => {
        mockClient.deleteDevice.mockResolvedValue({});

        await handlers.handleToolCall('delete_resource', {
          deviceId: 1,
          deleteFromSystem: true,
        });

        expect(mockClient.deleteDevice).toHaveBeenCalledWith(1, {
          deleteFromSystem: true,
        });
      });
    });
  });

  describe('Device Groups', () => {
    describe('list_resource_groups', () => {
      it('should list device groups with curated fields', async () => {
        const mockResponse = {
          items: [
            {
              id: 1,
              name: 'test-group',
              fullPath: '/test-group',
              extraField: 'filtered',
            },
          ],
          total: 1,
        };

        mockClient.listDeviceGroups.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_resource_groups', {});

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('name');
        expect(result.items[0]).not.toHaveProperty('extraField');
      });
    });

    describe('get_resource_group', () => {
      it('should get device group by ID', async () => {
        const mockGroup = { id: 1, name: 'test-group' };
        mockClient.getDeviceGroup.mockResolvedValue(mockGroup);

        const result = await handlers.handleToolCall('get_resource_group', {
          groupId: 1,
        });

        expect(result).toEqual(mockGroup);
      });
    });

    describe('create_resource_group', () => {
      it('should create device group', async () => {
        const mockGroup = { id: 1, name: 'new-group' };
        mockClient.createDeviceGroup.mockResolvedValue(mockGroup);

        const result = await handlers.handleToolCall('create_resource_group', {
          name: 'new-group',
        });

        expect(result).toEqual(mockGroup);
        expect(mockClient.createDeviceGroup).toHaveBeenCalledWith({
          name: 'new-group',
        });
      });

      it('should create device group with optional properties', async () => {
        const mockGroup = { id: 1, name: 'new-group' };
        mockClient.createDeviceGroup.mockResolvedValue(mockGroup);

        await handlers.handleToolCall('create_resource_group', {
          name: 'new-group',
          parentId: 2,
          description: 'Test group',
          disableAlerting: true,
          customProperties: [{ name: 'env', value: 'prod' }],
        });

        expect(mockClient.createDeviceGroup).toHaveBeenCalledWith({
          name: 'new-group',
          parentId: 2,
          description: 'Test group',
          disableAlerting: true,
          customProperties: [{ name: 'env', value: 'prod' }],
        });
      });
    });

    describe('update_resource_group', () => {
      it('should update device group', async () => {
        const mockGroup = { id: 1, name: 'updated-group' };
        mockClient.updateDeviceGroup.mockResolvedValue(mockGroup);

        const result = await handlers.handleToolCall('update_resource_group', {
          groupId: 1,
          name: 'updated-group',
        });

        expect(result).toEqual(mockGroup);
        expect(mockClient.updateDeviceGroup).toHaveBeenCalledWith(
          1,
          { name: 'updated-group' },
          { opType: 'replace' },
        );
      });
    });

    describe('delete_resource_group', () => {
      it('should delete device group', async () => {
        mockClient.deleteDeviceGroup.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_resource_group', {
          groupId: 1,
        });

        expect(result).toEqual({});
        expect(mockClient.deleteDeviceGroup).toHaveBeenCalledWith(1, {
          deleteChildren: undefined,
        });
      });

      it('should delete device group with children', async () => {
        mockClient.deleteDeviceGroup.mockResolvedValue({});

        await handlers.handleToolCall('delete_resource_group', {
          groupId: 1,
          deleteChildren: true,
        });

        expect(mockClient.deleteDeviceGroup).toHaveBeenCalledWith(1, {
          deleteChildren: true,
        });
      });
    });
  });

  describe('Alerts', () => {
    describe('list_alerts', () => {
      it('should list alerts with curated fields', async () => {
        const mockResponse = {
          items: [
            {
              id: 'alert1',
              internalId: 'int1',
              type: 'datapoint',
              severity: 'error',
              extraField: 'filtered',
            },
          ],
          total: 1,
        };

        mockClient.listAlerts.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_alerts', {});

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('severity');
        expect(result.items[0]).not.toHaveProperty('extraField');
      });

      it('should list alerts with needMessage parameter', async () => {
        const mockResponse = { items: [], total: 0 };
        mockClient.listAlerts.mockResolvedValue(mockResponse);

        await handlers.handleToolCall('list_alerts', {
          needMessage: true,
        });

        expect(mockClient.listAlerts).toHaveBeenCalledWith({
          size: undefined,
          offset: undefined,
          filter: undefined,
          fields: undefined,
          needMessage: true,
          autoPaginate: undefined,
        });
      });
    });

    describe('get_alert', () => {
      it('should get alert by ID', async () => {
        const mockAlert = { id: 'alert1', severity: 'error' };
        mockClient.getAlert.mockResolvedValue(mockAlert);

        const result = await handlers.handleToolCall('get_alert', {
          alertId: 'alert1',
        });

        expect(result).toEqual(mockAlert);
      });
    });

    describe('acknowledge_alert', () => {
      it('should acknowledge alert', async () => {
        mockClient.acknowledgeAlert.mockResolvedValue({});

        const result = await handlers.handleToolCall('acknowledge_alert', {
          alertId: 'alert1',
          comment: 'Acknowledged',
        });

        expect(result).toEqual({});
        expect(mockClient.acknowledgeAlert).toHaveBeenCalledWith('alert1', 'Acknowledged');
      });
    });

    describe('add_alert_note', () => {
      it('should add note to alert', async () => {
        mockClient.addAlertNote.mockResolvedValue({});

        const result = await handlers.handleToolCall('add_alert_note', {
          alertId: 'alert1',
          note: 'Test note',
        });

        expect(result).toEqual({});
        expect(mockClient.addAlertNote).toHaveBeenCalledWith('alert1', 'Test note');
      });
    });
  });

  describe('Collectors', () => {
    describe('list_collectors', () => {
      it('should list collectors with curated fields', async () => {
        const mockResponse = {
          items: [
            {
              id: 1,
              description: 'test-collector',
              hostname: 'collector.example.com',
              status: 'active',
              extraField: 'filtered',
            },
          ],
          total: 1,
        };

        mockClient.listCollectors.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_collectors', {});

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('hostname');
        expect(result.items[0]).not.toHaveProperty('extraField');
      });

      it('should include the fields needed to judge health, version and layout by default', async () => {
        mockClient.listCollectors.mockResolvedValue({
          items: [{
            id: 3,
            description: 'COV\\COLLECTOR',
            hostname: 'host',
            platform: 'windows',
            status: 1,
            isDown: false,
            build: '41000',
            numberOfHosts: 12,
            numberOfInstances: 0,
            collectorGroupName: 'EUS',
            collectorDeviceId: 99,
            upTime: 123,
          }],
          total: 1,
        });

        const result = await handlers.handleToolCall('list_collectors', {});

        expect(Object.keys(result.items[0])).toEqual(expect.arrayContaining([
          'isDown', 'build', 'numberOfInstances', 'collectorGroupName', 'collectorDeviceId',
        ]));
        expect(result.items[0]).not.toHaveProperty('upTime');
      });
    });

    describe('list_collector_events', () => {
      it('should list events for a collector', async () => {
        const mockResponse = {
          items: [{ reportedOn: 1790947102, eventMsg: 'Collector restarted' }],
          total: 1,
        };
        mockClient.listCollectorEvents.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_collector_events', {
          collectorId: 1455,
          filter: 'reportedOn>:1790861470',
          size: 100,
        });

        expect(mockClient.listCollectorEvents).toHaveBeenCalledWith(1455, {
          size: 100,
          offset: undefined,
          filter: 'reportedOn>:1790861470',
          fields: undefined,
          autoPaginate: undefined,
        });
        expect(result).toEqual(mockResponse);
      });
    });

    describe('get_collector', () => {
      it('should get collector by ID', async () => {
        const mockCollector = { id: 1, description: 'test-collector' };
        mockClient.getCollector.mockResolvedValue(mockCollector);

        const result = await handlers.handleToolCall('get_collector', {
          collectorId: 1,
        });

        expect(result).toEqual(mockCollector);
      });
    });

    describe('update_collector', () => {
      it('should update collector with replace opType by default', async () => {
        const mockCollector = { id: 16, description: 'EXTRANET\\AZETAAAEXTWP02' };
        mockClient.updateCollector.mockResolvedValue(mockCollector);

        const result = await handlers.handleToolCall('update_collector', {
          collectorId: 16,
          customProperties: [{ name: 'Site', value: 'Cloud-Azure East' }],
        });

        expect(result).toEqual(mockCollector);
        expect(mockClient.updateCollector).toHaveBeenCalledWith(
          16,
          { customProperties: [{ name: 'Site', value: 'Cloud-Azure East' }] },
          { opType: 'replace', autoBalanceMonitoredDevices: undefined, forceUpdateFailedOverDevices: undefined },
        );
      });

      it('should update collector with add opType to merge a new property', async () => {
        const mockCollector = { id: 16, description: 'EXTRANET\\AZETAAAEXTWP02' };
        mockClient.updateCollector.mockResolvedValue(mockCollector);

        await handlers.handleToolCall('update_collector', {
          collectorId: 16,
          customProperties: [{ name: 'Site', value: 'Cloud-Azure East' }],
          opType: 'add',
        });

        expect(mockClient.updateCollector).toHaveBeenCalledWith(
          16,
          { customProperties: [{ name: 'Site', value: 'Cloud-Azure East' }] },
          { opType: 'add', autoBalanceMonitoredDevices: undefined, forceUpdateFailedOverDevices: undefined },
        );
      });

      it('should not send collectorId/opType/rebalance flags in the request body', async () => {
        mockClient.updateCollector.mockResolvedValue({ id: 16 });

        await handlers.handleToolCall('update_collector', {
          collectorId: 16,
          description: 'renamed-collector',
          autoBalanceMonitoredDevices: true,
          forceUpdateFailedOverDevices: true,
        });

        expect(mockClient.updateCollector).toHaveBeenCalledWith(
          16,
          { description: 'renamed-collector' },
          { opType: 'replace', autoBalanceMonitoredDevices: true, forceUpdateFailedOverDevices: true },
        );
      });
    });

    describe('delete_collector', () => {
      it('should delete a collector by ID', async () => {
        mockClient.deleteCollector.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_collector', {
          collectorId: 16,
        });

        expect(result).toEqual({});
        expect(mockClient.deleteCollector).toHaveBeenCalledWith(16);
      });
    });

    describe('delete_collector_group', () => {
      it('should delete a collector group by ID', async () => {
        mockClient.deleteCollectorGroup.mockResolvedValue({});

        await handlers.handleToolCall('delete_collector_group', { groupId: 5 });

        expect(mockClient.deleteCollectorGroup).toHaveBeenCalledWith(5);
      });
    });

    describe('update_collector_group', () => {
      it('should update collector group with replace opType by default', async () => {
        const mockGroup = { id: 5, name: 'Azure Collectors' };
        mockClient.updateCollectorGroup.mockResolvedValue(mockGroup);

        const result = await handlers.handleToolCall('update_collector_group', {
          groupId: 5,
          customProperties: [{ name: 'needsFailoverCollector', value: 'false' }],
        });

        expect(result).toEqual(mockGroup);
        expect(mockClient.updateCollectorGroup).toHaveBeenCalledWith(
          5,
          { customProperties: [{ name: 'needsFailoverCollector', value: 'false' }] },
          { opType: 'replace' },
        );
      });

      it('should update collector group with add opType to merge a new property', async () => {
        const mockGroup = { id: 5, name: 'Azure Collectors' };
        mockClient.updateCollectorGroup.mockResolvedValue(mockGroup);

        await handlers.handleToolCall('update_collector_group', {
          groupId: 5,
          customProperties: [{ name: 'needsFailoverCollector', value: 'false' }],
          opType: 'add',
        });

        expect(mockClient.updateCollectorGroup).toHaveBeenCalledWith(
          5,
          { customProperties: [{ name: 'needsFailoverCollector', value: 'false' }] },
          { opType: 'add' },
        );
      });

      it('should not send groupId/opType in the request body', async () => {
        mockClient.updateCollectorGroup.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_collector_group', {
          groupId: 5,
          name: 'renamed-group',
        });

        expect(mockClient.updateCollectorGroup).toHaveBeenCalledWith(
          5,
          { name: 'renamed-group' },
          { opType: 'replace' },
        );
      });
    });
  });

  describe('Debug Commands', () => {
    describe('execute_debug_command', () => {
      it('should execute a debug command and return synchronous output', async () => {
        const mockResult = { cmdline: 'help', output: 'available commands...' };
        mockClient.executeDebugCommand.mockResolvedValue(mockResult);

        const result = await handlers.handleToolCall('execute_debug_command', {
          collectorId: 129,
          cmdline: 'help',
        });

        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith('help', 129);
        // The echoed command line is dropped and the result is marked finished.
        expect(result).toEqual({ output: 'available commands...', pending: false });
      });

      it('should wait for a debug command that returns a session and return its output', async () => {
        const mockResult = { cmdline: '!groovy hostId=6412\nreturn 0', cmdContext: 'ctx-1', sessionId: 'sess-1', output: '' };
        mockClient.executeDebugCommand.mockResolvedValue(mockResult);
        mockClient.getDebugCommandResult.mockResolvedValue({ output: 'returns 0\noutput:\n', sessionId: 'sess-1', cmdline: null });

        const result = await handlers.handleToolCall('execute_debug_command', {
          collectorId: 129,
          cmdline: '!groovy hostId=6412\nreturn 0',
        });

        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith('!groovy hostId=6412\nreturn 0', 129);
        expect(mockClient.getDebugCommandResult).toHaveBeenCalledWith('sess-1', 129);
        expect(result).toMatchObject({ output: 'returns 0\noutput:\n', sessionId: 'sess-1', pending: false });
        expect(result.cmdline).toBeUndefined();
      });

      it('should return the session without waiting when waitSeconds is 0', async () => {
        mockClient.executeDebugCommand.mockResolvedValue({ cmdline: 'x', sessionId: 'sess-2', output: '' });
        mockClient.getDebugCommandResult.mockClear();

        const result = await handlers.handleToolCall('execute_debug_command', {
          collectorId: 129,
          cmdline: '!tlist',
          waitSeconds: 0,
        });

        expect(mockClient.getDebugCommandResult).not.toHaveBeenCalled();
        expect(result).toMatchObject({ sessionId: 'sess-2', pending: true, output: '' });
      });

      it('should echo the command only when includeCommand is true', async () => {
        mockClient.executeDebugCommand.mockResolvedValue({ cmdline: 'ignored', output: 'ok' });

        const result = await handlers.handleToolCall('execute_debug_command', {
          collectorId: 129,
          cmdline: '!tlist',
          includeCommand: true,
        });

        expect(result.cmdline).toBe('!tlist');
      });
    });

    describe('get_debug_command_result', () => {
      it('should poll for debug command output by session id', async () => {
        const mockResult = { output: 'hello world!', sessionId: 'sess-1' };
        mockClient.getDebugCommandResult.mockResolvedValue(mockResult);

        const result = await handlers.handleToolCall('get_debug_command_result', {
          id: 'sess-1',
          collectorId: 129,
        });

        expect(mockClient.getDebugCommandResult).toHaveBeenCalledWith('sess-1', 129);
        expect(result).toEqual({ output: 'hello world!', sessionId: 'sess-1', pending: false });
      });

      it('should report a command that is still running as pending, not as an error', async () => {
        mockClient.getDebugCommandResult.mockResolvedValue({
          errorMessage: 'agent has fetched the task, waiting for response',
          errorCode: 1202,
          errorDetail: null,
        });

        const result = await handlers.handleToolCall('get_debug_command_result', {
          id: 'sess-1',
          collectorId: 129,
        });

        expect(result).toMatchObject({ sessionId: 'sess-1', pending: true, output: '' });
        expect(result.errorCode).toBeUndefined();
      });
    });

    describe('execute_groovy_script', () => {
      it('should build a cmdline from scriptBody and options', async () => {
        mockClient.executeDebugCommand.mockResolvedValue({ cmdline: 'x', output: 'ok' });

        await handlers.handleToolCall('execute_groovy_script', {
          collectorId: 129,
          scriptBody: 'println "hi"',
          timeout: 60,
          runner: 'agent',
          hostId: 6412,
        });

        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith(
          '!groovy timeout=60 runner=agent hostId=6412 \nprintln "hi"',
          129,
        );
      });

      it('should build a cmdline from scriptPath', async () => {
        mockClient.executeDebugCommand.mockResolvedValue({ cmdline: 'x', output: 'ok' });

        await handlers.handleToolCall('execute_groovy_script', {
          collectorId: 129,
          scriptPath: '../lib/test.groovy',
        });

        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith('!groovy ../lib/test.groovy', 129);
      });

      it('should reject when both scriptPath and scriptBody are given', async () => {
        await expect(handlers.handleToolCall('execute_groovy_script', {
          collectorId: 129,
          scriptPath: 'a.groovy',
          scriptBody: 'println 1',
        })).rejects.toThrow();
      });

      it('should reject when neither scriptPath nor scriptBody is given', async () => {
        await expect(handlers.handleToolCall('execute_groovy_script', {
          collectorId: 129,
        })).rejects.toThrow();
      });
    });

    describe('execute_powershell_script', () => {
      it('should build a cmdline from scriptPath and options', async () => {
        mockClient.executeDebugCommand.mockResolvedValue({ cmdline: 'x', output: 'ok' });

        await handlers.handleToolCall('execute_powershell_script', {
          collectorId: 257,
          scriptPath: '../lib/test.ps1',
          timeout: 30,
          hostId: 100,
        });

        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith(
          '!posh timeout=30 hostId=100 ../lib/test.ps1',
          257,
        );
      });
    });
  });

  describe('DataSources', () => {
    describe('list_datasources', () => {
      it('should list datasources', async () => {
        const mockResponse = {
          items: [{ id: 1, name: 'test-datasource' }],
          total: 1,
        };

        mockClient.listDataSources.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_datasources', {});

        expect(result.items[0]).toHaveProperty('id');
        expect(result.items[0]).toHaveProperty('name');
      });
    });

    describe('get_datasource', () => {
      it('should get datasource by ID', async () => {
        const mockDataSource = { id: 1, name: 'test-datasource' };
        mockClient.getDataSource.mockResolvedValue(mockDataSource);

        const result = await handlers.handleToolCall('get_datasource', {
          dataSourceId: 1,
        });

        expect(result).toEqual(mockDataSource);
      });

      it('should return a compact view by default (scripts replaced, datapoints summarized)', async () => {
        mockClient.getDataSource.mockResolvedValue({
          id: 2,
          name: 'scripted',
          collectorAttribute: { name: 'batchscript', groovyScript: 'println "hello"' },
          dataPoints: [{ id: 5, name: 'dp', alertBody: 'long template', originId: 'x', alertExpr: '> 1' }],
        });

        const result = await handlers.handleToolCall('get_datasource', { dataSourceId: 2 });

        expect(mockClient.getDataSource).toHaveBeenCalledWith(2, { fields: undefined });
        expect(result.collectorAttribute.groovyScript).toBe('<15 chars; use get_datasource_scripts>');
        expect(result.dataPoints).toEqual([{ id: 5, name: 'dp', alertExpr: '> 1' }]);
        expect(result.note).toContain('fields');
      });

      it('should return the fields as the API sent them when fields is given', async () => {
        const raw = {
          id: 2,
          collectorAttribute: { groovyScript: 'println "hello"' },
          dataPoints: [{ id: 5, name: 'dp', alertBody: 'long template' }],
        };
        mockClient.getDataSource.mockResolvedValue(raw);

        const result = await handlers.handleToolCall('get_datasource', { dataSourceId: 2, fields: '*' });

        expect(mockClient.getDataSource).toHaveBeenCalledWith(2, { fields: '*' });
        expect(result).toEqual(raw);
      });
    });

    describe('get_datasource_scripts', () => {
      it('should extract scripts from the fetched datasource', async () => {
        mockClient.getDataSource.mockResolvedValue({
          id: 1,
          collectorAttribute: { name: 'script', groovyScript: 'println 1' },
        });

        const result = await handlers.handleToolCall('get_datasource_scripts', {
          dataSourceId: 1,
        });

        expect(mockClient.getDataSource).toHaveBeenCalledWith(1);
        expect(result).toEqual({
          dataSourceId: 1,
          scripts: [
            {
              location: 'collectorAttribute (collection method)',
              field: 'groovyScript',
              language: 'groovy',
              content: 'println 1',
            },
          ],
        });
      });
    });

    describe('datasource graphs', () => {
      it('lists overview graphs of a datasource', async () => {
        const list = { total: 1, items: [{ id: 3, name: 'g' }] };
        mockClient.listDataSourceOverviewGraphs.mockResolvedValue(list);

        const result = await handlers.handleToolCall('list_datasource_overview_graphs', { dataSourceId: 7, size: 10 });

        expect(mockClient.listDataSourceOverviewGraphs).toHaveBeenCalledWith(7, { size: 10, offset: undefined, filter: undefined, fields: undefined });
        expect(result).toEqual(list);
      });

      it('gets one overview graph', async () => {
        mockClient.getDataSourceOverviewGraph.mockResolvedValue({ id: 3 });

        await handlers.handleToolCall('get_datasource_overview_graph', { dataSourceId: 7, graphId: 3 });

        expect(mockClient.getDataSourceOverviewGraph).toHaveBeenCalledWith(7, 3, { fields: undefined });
      });

      it('lists and gets instance graphs', async () => {
        mockClient.listDataSourceGraphs.mockResolvedValue({ total: 0, items: [] });
        mockClient.getDataSourceGraph.mockResolvedValue({ id: 4 });

        await handlers.handleToolCall('list_datasource_graphs', { dataSourceId: 7, filter: 'name~"CPU"' });
        await handlers.handleToolCall('get_datasource_graph', { dataSourceId: 7, graphId: 4, fields: 'id,lines' });

        expect(mockClient.listDataSourceGraphs).toHaveBeenCalledWith(7, { size: undefined, offset: undefined, filter: 'name~"CPU"', fields: undefined });
        expect(mockClient.getDataSourceGraph).toHaveBeenCalledWith(7, 4, { fields: 'id,lines' });
      });

      it('requires graphId for the single-graph tools', async () => {
        await expect(handlers.handleToolCall('get_datasource_graph', { dataSourceId: 7 })).rejects.toThrow(/graphId/);
        expect(mockClient.getDataSourceGraph).not.toHaveBeenCalled();
      });
    });

    describe('datasource graph writes', () => {
      beforeEach(() => {
        mockClient.getDataSource.mockResolvedValue({ dataPoints: [{ id: 11, name: 'alpha' }, { id: 12, name: 'beta' }] });
      });

      it('creates an instance graph, resolving datapoint names to ids and defaulting the title', async () => {
        mockClient.createDataSourceGraph.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('create_datasource_graph', {
          dataSourceId: 7, name: 'g', verticalLabel: 'count', lines: [{ dataPointName: 'alpha', type: 'area' }],
        });

        expect(mockClient.getDataSource).toHaveBeenCalledWith(7, { fields: 'dataPoints' });
        expect(mockClient.createDataSourceGraph).toHaveBeenCalledWith(7, {
          name: 'g',
          title: 'g',
          verticalLabel: 'count',
          lines: [{ dataPointName: 'alpha', isVirtualDataPoint: false, type: 2, legend: 'alpha', colorName: 'blue' }],
          dataPoints: [{ name: 'alpha', dataPointId: 11, consolidateFunc: 1 }],
        });
      });

      it('creates a stacked-by-instance overview graph', async () => {
        mockClient.createDataSourceOverviewGraph.mockResolvedValue({ id: 6 });

        await handlers.handleToolCall('create_datasource_overview_graph', {
          dataSourceId: 7, name: 'o', verticalLabel: 'count', aggregated: false, lines: [{ dataPointName: 'beta', type: 'stack', legend: '##INSTANCE##' }],
        });

        expect(mockClient.createDataSourceOverviewGraph).toHaveBeenCalledWith(7, expect.objectContaining({
          aggregated: false,
          dataPoints: [{ dataPointName: 'beta', dataPointId: 12, aggregateMethod: 'sum', consolidateFunc: 1 }],
        }));
      });

      it('rejects an unknown datapoint before calling the API', async () => {
        await expect(handlers.handleToolCall('create_datasource_graph', {
          dataSourceId: 7, name: 'g', verticalLabel: 'count', lines: [{ dataPointName: 'nope' }],
        })).rejects.toThrow(/not found/);
        expect(mockClient.createDataSourceGraph).not.toHaveBeenCalled();
      });

      it('updates settings without touching the datasource or the existing lines', async () => {
        mockClient.updateDataSourceGraph.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_datasource_graph', { dataSourceId: 7, graphId: 5, title: 'New' });

        expect(mockClient.getDataSource).not.toHaveBeenCalled();
        expect(mockClient.getDataSourceGraph).not.toHaveBeenCalled();
        expect(mockClient.updateDataSourceGraph).toHaveBeenCalledWith(7, 5, { title: 'New' });
      });

      it('keeps existing dataPoints when only the lines of a graph are updated', async () => {
        mockClient.getDataSourceGraph.mockResolvedValue({ dataPoints: [{ name: 'beta', dataPointId: 12, consolidateFunc: 1 }] });
        mockClient.updateDataSourceGraph.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_datasource_graph', {
          dataSourceId: 7, graphId: 5, lines: [{ dataPointName: 'alpha' }],
        });

        expect(mockClient.getDataSourceGraph).toHaveBeenCalledWith(7, 5, { fields: 'dataPoints' });
        const body = mockClient.updateDataSourceGraph.mock.calls[0][2];
        expect(body.dataPoints.map((d: any) => d.name)).toEqual(['alpha', 'beta']);
      });

      it('deletes graphs', async () => {
        mockClient.deleteDataSourceGraph.mockResolvedValue({});
        mockClient.deleteDataSourceOverviewGraph.mockResolvedValue({});

        await handlers.handleToolCall('delete_datasource_graph', { dataSourceId: 7, graphId: 5 });
        await handlers.handleToolCall('delete_datasource_overview_graph', { dataSourceId: 7, graphId: 6 });

        expect(mockClient.deleteDataSourceGraph).toHaveBeenCalledWith(7, 5);
        expect(mockClient.deleteDataSourceOverviewGraph).toHaveBeenCalledWith(7, 6);
      });
    });

    describe('create_datasource', () => {
      it('should create a datasource', async () => {
        const mockCreated = { id: 5, name: 'MyDS' };
        mockClient.createDataSource.mockResolvedValue(mockCreated);

        const result = await handlers.handleToolCall('create_datasource', {
          name: 'MyDS',
          displayName: 'My DS',
          collectMethod: 'script',
          collectInterval: 300,
          collectorAttribute: { name: 'script', groovyScript: 'return 0' },
        });

        expect(mockClient.createDataSource).toHaveBeenCalledWith(expect.objectContaining({
          name: 'MyDS',
          collectMethod: 'script',
          collectInterval: 300,
          collectorAttribute: {
            name: 'script', groovyScript: 'return 0',
            linuxCmdline: '', linuxScript: '', windowsCmdline: '', windowsScript: '',
          },
        }));
        expect(result).toEqual(mockCreated);
      });

      const base = {
        name: 'MyDS',
        displayName: 'My DS',
        collectMethod: 'script',
        collectInterval: 300,
        collectorAttribute: { name: 'script', groovyScript: 'return 0' },
      };

      it('should pass hasMultiInstances through in the request body', async () => {
        mockClient.createDataSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('create_datasource', { ...base, hasMultiInstances: true });
        expect(mockClient.createDataSource).toHaveBeenCalledWith(
          expect.objectContaining({ hasMultiInstances: true }),
        );
      });

      it('should default hasMultiInstances to true when enableAutoDiscovery is true', async () => {
        mockClient.createDataSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('create_datasource', { ...base, enableAutoDiscovery: true });
        expect(mockClient.createDataSource).toHaveBeenCalledWith(
          expect.objectContaining({ hasMultiInstances: true }),
        );
      });

      it('should respect an explicit hasMultiInstances false with auto discovery', async () => {
        mockClient.createDataSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('create_datasource', {
          ...base,
          enableAutoDiscovery: true,
          hasMultiInstances: false,
        });
        expect(mockClient.createDataSource).toHaveBeenCalledWith(
          expect.objectContaining({ hasMultiInstances: false }),
        );
      });

      it('should not set hasMultiInstances when auto discovery is off and it is unspecified', async () => {
        mockClient.createDataSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('create_datasource', base);
        expect(mockClient.createDataSource.mock.calls[0][0].hasMultiInstances).toBeUndefined();
      });
    });

    describe('update_datasource', () => {
      it('should update a datasource with only the given fields', async () => {
        const mockUpdated = { id: 5, name: 'MyDS', description: 'updated' };
        mockClient.updateDataSource.mockResolvedValue(mockUpdated);

        const result = await handlers.handleToolCall('update_datasource', {
          dataSourceId: 5,
          description: 'updated',
        });

        expect(mockClient.updateDataSource).toHaveBeenCalledWith(5, { description: 'updated' });
        expect(result).toEqual(mockUpdated);
      });
    });

    describe('update_datasource keeps datapoint originIds', () => {
      it('fills in originId for datapoints sent with an id but without one', async () => {
        mockClient.getDataSource.mockResolvedValue({ dataPoints: [
          { id: 1, name: 'a', originId: 'origin-a' },
          { id: 2, name: 'b', originId: '' },
        ] });
        mockClient.updateDataSource.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_datasource', {
          dataSourceId: 5,
          dataPoints: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { name: 'new' }, { id: 1, name: 'x', originId: 'mine' }],
        });

        expect(mockClient.getDataSource).toHaveBeenCalledWith(5, { fields: 'dataPoints' });
        expect(mockClient.updateDataSource).toHaveBeenCalledWith(5, { dataPoints: [
          { id: 1, name: 'a', originId: 'origin-a' },
          { id: 2, name: 'b' },
          { name: 'new' },
          { id: 1, name: 'x', originId: 'mine' },
        ] });
      });

      it('does not look anything up when no datapoint needs it, and still updates if the lookup fails', async () => {
        mockClient.getDataSource.mockReset();
        mockClient.updateDataSource.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_datasource', { dataSourceId: 5, description: 'd' });
        await handlers.handleToolCall('update_datasource', { dataSourceId: 5, dataPoints: [{ name: 'new' }] });
        expect(mockClient.getDataSource).not.toHaveBeenCalled();

        mockClient.getDataSource.mockRejectedValue(new Error('boom'));
        await handlers.handleToolCall('update_datasource', { dataSourceId: 5, dataPoints: [{ id: 1, name: 'a' }] });
        expect(mockClient.updateDataSource).toHaveBeenLastCalledWith(5, { dataPoints: [{ id: 1, name: 'a' }] });
      });
    });

    describe('create/update_datasource defaults', () => {
      it('fills in the script discriminator and discovery defaults on create', async () => {
        mockClient.createDataSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('create_datasource', {
          name: 'B', displayName: 'B', collectMethod: 'batchscript', collectInterval: 300,
          collectorAttribute: { scriptType: 'embed', groovyScript: 'println 1' },
          enableAutoDiscovery: true,
          autoDiscoveryConfig: { instanceAutoGroupMethodParams: null, method: { groovyScript: 'println 2' } },
        });
        const body = mockClient.createDataSource.mock.calls[0][0];
        expect(body.collectorAttribute).toMatchObject({ name: 'batchscript', linuxScript: '', windowsCmdline: '' });
        expect(body.autoDiscoveryConfig).toEqual({
          instanceAutoGroupMethodParams: '',
          method: { groovyScript: 'println 2', name: 'ad_script', type: 'embeded' },
          filters: [],
        });
      });

      it('rejects a malformed autoDiscoveryConfig before calling LogicMonitor', async () => {
        await expect(handlers.handleToolCall('create_datasource', {
          name: 'B', displayName: 'B', collectMethod: 'script', collectInterval: 300,
          collectorAttribute: { groovyScript: 'x' }, autoDiscoveryConfig: { instanceAutoGroupMethodParams: 3 },
        })).rejects.toThrow(/must be a string/);
        expect(mockClient.createDataSource).not.toHaveBeenCalled();
      });

      it('does not blank scripts on update, and warns about datapoints sent without an id', async () => {
        mockClient.updateDataSource.mockResolvedValue({ id: 5 });
        const result: any = await handlers.handleToolCall('update_datasource', {
          dataSourceId: 5, collectMethod: 'script', collectorAttribute: { groovyScript: 'y' }, dataPoints: [{ name: 'new' }],
        });
        expect(mockClient.updateDataSource).toHaveBeenCalledWith(5, expect.objectContaining({
          collectorAttribute: { groovyScript: 'y', name: 'script' },
        }));
        expect(result.warning).toContain('1 datapoint');
      });
    });

    describe('get_datasource datapointsOnly', () => {
      it('returns only the trimmed datapoints', async () => {
        mockClient.getDataSource.mockResolvedValue({
          id: 2, name: 'DS', dataPoints: [{ id: 5, name: 'dp', alertBody: 'long', postProcessorMethod: 'namevalue', postProcessorParam: 'x' }],
        });
        const result = await handlers.handleToolCall('get_datasource', { dataSourceId: 2, datapointsOnly: true });
        expect(mockClient.getDataSource).toHaveBeenCalledWith(2, { fields: 'id,name,dataPoints' });
        expect(result).toEqual({ id: 2, name: 'DS', dataPoints: [{ id: 5, name: 'dp', postProcessorMethod: 'namevalue', postProcessorParam: 'x' }] });
      });
    });

    describe('test_datasource', () => {
      const batchDs = {
        collectMethod: 'batchscript', hasMultiInstances: true, enableAutoDiscovery: true,
        collectorAttribute: { groovyScript: 'collect' },
        autoDiscoveryConfig: { method: { groovyScript: 'discover' } },
        dataPoints: [{ name: 'load', postProcessorMethod: 'namevalue', postProcessorParam: '##WILDVALUE##.load' }],
      };

      beforeEach(() => {
        mockClient.getDevice.mockResolvedValue({ id: 9, preferredCollectorId: 3 } as any);
        mockClient.getCollector.mockResolvedValue({ id: 3, description: 'c', isDown: false } as any);
        mockClient.executeDebugCommand.mockImplementation(async (cmd: string) =>
          ({ output: cmd.includes('discover') ? 'returns 0\na##A##d####\nb##B##d####\n' : 'returns 0\na.load=1\nb.load=2\n' }) as any);
      });

      it('runs discovery and collection on the preferred collector and shows values per instance', async () => {
        mockClient.getDataSource.mockResolvedValue(batchDs);
        const result: any = await handlers.handleToolCall('test_datasource', { dataSourceId: 1, deviceId: 9 });
        expect(mockClient.executeDebugCommand).toHaveBeenCalledWith(expect.stringMatching(/^!groovy hostId=9 \n/), 3);
        expect(result.results).toEqual([
          { instance: 'a', datapoints: [{ name: 'load', value: 1 }] },
          { instance: 'b', datapoints: [{ name: 'load', value: 2 }] },
        ]);
      });

      it('evaluates a single-instance script', async () => {
        mockClient.getDataSource.mockResolvedValue({
          collectMethod: 'script', collectorAttribute: { groovyScript: 'collect' },
          dataPoints: [{ name: 'm', postProcessorMethod: 'namevalue', postProcessorParam: 'm' }],
        });
        mockClient.executeDebugCommand.mockResolvedValue({ output: 'm=5' } as any);
        const result: any = await handlers.handleToolCall('test_datasource', { dataSourceId: 1, deviceId: 9, collectorId: 4 });
        expect(mockClient.getCollector).toHaveBeenCalledWith(4, expect.anything());
        expect(result.results).toEqual([{ datapoints: [{ name: 'm', value: 5 }] }]);
      });

      it('refuses a collector that is down and a resource without one', async () => {
        mockClient.getCollector.mockResolvedValue({ id: 3, isDown: true } as any);
        await expect(handlers.handleToolCall('test_datasource', { dataSourceId: 1, deviceId: 9 })).rejects.toThrow(/is down/);
        mockClient.getDevice.mockResolvedValue({ id: 9 } as any);
        await expect(handlers.handleToolCall('test_datasource', { dataSourceId: 1, deviceId: 9 })).rejects.toThrow(/pass collectorId/);
        expect(mockClient.executeDebugCommand).not.toHaveBeenCalled();
      });

      it('rejects DataSources it cannot run', async () => {
        mockClient.getDataSource.mockResolvedValue({ collectMethod: 'snmp', collectorAttribute: {} });
        await expect(handlers.handleToolCall('test_datasource', { dataSourceId: 1, deviceId: 9 })).rejects.toThrow(/script or batchscript/);
      });
    });

    describe('missing required argument errors', () => {
      it('name the unrecognized arguments and the accepted parameters', async () => {
        await expect(handlers.handleToolCall('get_datasource', { id: 5 })).rejects.toThrow(/unrecognized argument received: id/);
        await expect(handlers.handleToolCall('update_resource_property', { resourceId: 1, propertyName: 'a', value: 'b' }))
          .rejects.toThrow(/Missing required argument for update_resource_property: deviceId \(unrecognized argument received: resourceId\)/);
      });
    });

    describe('concise write results (returnFull)', () => {
      const bigDataSource = () => ({
        id: 5,
        name: 'MyDS',
        description: 'updated',
        collectorAttribute: { name: 'batchscript', groovyScript: 'println "x"\n'.repeat(1000) },
        dataPoints: Array.from({ length: 10 }, (_, i) => ({ id: i, name: `dp${i}`, alertBody: 'b'.repeat(200) })),
      });

      it('shortens a large update result and lists what was left out', async () => {
        mockClient.updateDataSource.mockResolvedValue(bigDataSource());

        const result: any = await handlers.handleToolCall('update_datasource', { dataSourceId: 5, description: 'updated' });

        expect(result).toMatchObject({ id: 5, name: 'MyDS', description: 'updated' });
        expect(result.dataPoints).toBeUndefined();
        expect(result.omitted.dataPoints).toBe('array of 10');
        expect(result.note).toContain('returnFull');
      });

      it('returns the complete object when returnFull is true or the string "true"', async () => {
        mockClient.updateDataSource.mockResolvedValue(bigDataSource());

        for (const flag of [true, 'true']) {
          const result: any = await handlers.handleToolCall('update_datasource', { dataSourceId: 5, description: 'updated', returnFull: flag });
          expect(result.dataPoints).toHaveLength(10);
          expect(result.omitted).toBeUndefined();
        }
      });

      it('does not send returnFull to the API', async () => {
        mockClient.updateDataSource.mockResolvedValue({ id: 5 });

        await handlers.handleToolCall('update_datasource', { dataSourceId: 5, description: 'updated', returnFull: true });

        expect(mockClient.updateDataSource).toHaveBeenCalledWith(5, { description: 'updated' });
      });

      it('does not shorten results of read tools', async () => {
        mockClient.getDataSource = mockClient.getDataSource ?? jest.fn();
        const big = bigDataSource();
        mockClient.getDataSource.mockResolvedValue(big);
        const result: any = await handlers.handleToolCall('get_datasource', { dataSourceId: 5, fields: '*' });
        expect(result.omitted).toBeUndefined();
      });
    });

    describe('delete_datasource', () => {
      it('should delete a datasource by ID', async () => {
        mockClient.deleteDataSource.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_datasource', {
          dataSourceId: 5,
        });

        expect(mockClient.deleteDataSource).toHaveBeenCalledWith(5);
        expect(result).toEqual({});
      });
    });

    describe('list_resource_instances', () => {
      it('should list device datasource instances', async () => {
        const mockInstances = { items: [], total: 0 };
        mockClient.listDeviceDataSourceInstances.mockResolvedValue(mockInstances);

        const result = await handlers.handleToolCall('list_resource_instances', {
          deviceId: 1,
          deviceDataSourceId: 2,
        });

        expect(result).toEqual(mockInstances);
        expect(mockClient.listDeviceDataSourceInstances).toHaveBeenCalledWith(1, 2, {
          size: undefined,
          offset: undefined,
          filter: undefined,
          fields: undefined,
        });
      });
    });

    describe('get_resource_instance_data', () => {
      it('should get device instance data', async () => {
        const mockData = { data: [], timestamps: [] };
        mockClient.getDeviceDataSourceInstanceData.mockResolvedValue(mockData);

        const result = await handlers.handleToolCall('get_resource_instance_data', {
          deviceId: 1,
          deviceDataSourceId: 2,
          instanceId: 3,
        });

        expect(result).toEqual(mockData);
        expect(mockClient.getDeviceDataSourceInstanceData).toHaveBeenCalledWith(1, 2, 3, {
          datapoints: undefined,
          start: undefined,
          end: undefined,
          format: undefined,
        });
      });

      it('should get device instance data with parameters', async () => {
        const mockData = { data: [], timestamps: [] };
        mockClient.getDeviceDataSourceInstanceData.mockResolvedValue(mockData);

        await handlers.handleToolCall('get_resource_instance_data', {
          deviceId: 1,
          deviceDataSourceId: 2,
          instanceId: 3,
          datapoints: 'metric1,metric2',
          start: 1234567890,
          end: 1234567900,
          format: 'json',
        });

        expect(mockClient.getDeviceDataSourceInstanceData).toHaveBeenCalledWith(1, 2, 3, {
          datapoints: 'metric1,metric2',
          start: 1234567890,
          end: 1234567900,
          format: 'json',
        });
      });

      it('should pass paging and summarize options through', async () => {
        mockClient.getDeviceDataSourceInstanceData.mockResolvedValue({});

        await handlers.handleToolCall('get_resource_instance_data', {
          deviceId: 1,
          deviceDataSourceId: 2,
          instanceId: 3,
          autoPaginate: true,
          maxPages: 4,
          summarize: true,
        });

        expect(mockClient.getDeviceDataSourceInstanceData).toHaveBeenCalledWith(1, 2, 3,
          expect.objectContaining({ autoPaginate: true, maxPages: 4, summarize: true }));
      });

      it('should convert epoch milliseconds to seconds', async () => {
        mockClient.getDeviceDataSourceInstanceData.mockResolvedValue({});

        await handlers.handleToolCall('get_resource_instance_data', {
          deviceId: 1,
          deviceDataSourceId: 2,
          instanceId: 3,
          start: 1791494000123,
          end: 1791495000999,
        });

        expect(mockClient.getDeviceDataSourceInstanceData).toHaveBeenCalledWith(1, 2, 3,
          expect.objectContaining({ start: 1791494000, end: 1791495000 }));
      });
    });
  });

  describe('Device Group DataSources', () => {
    describe('list_resource_group_datasources', () => {
      it('should list datasources applied to a group', async () => {
        const mockResponse = {
          items: [{ dataSourceId: 34, dataSourceName: 'SSL_Certificates' }],
          total: 1,
        };
        mockClient.listDeviceGroupDataSources.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_resource_group_datasources', {
          groupId: 18,
        });

        expect(result).toEqual(mockResponse);
        expect(mockClient.listDeviceGroupDataSources).toHaveBeenCalledWith(18, {
          size: undefined,
          offset: undefined,
          filter: undefined,
          fields: undefined,
          autoPaginate: undefined,
        });
      });
    });

    describe('get_resource_group_datasource_thresholds', () => {
      it('should get group-level threshold overrides for a datasource', async () => {
        const mockSettings = {
          datasourceType: 'DS',
          dpConfig: [
            { dataPointId: 297, dataPointName: 'DaysRemaining', alertExpr: '', globalAlertExpr: '< 28 7 2' },
          ],
        };
        mockClient.getDeviceGroupDataSourceAlertSettings.mockResolvedValue(mockSettings);

        const result = await handlers.handleToolCall('get_resource_group_datasource_thresholds', {
          groupId: 18,
          dataSourceId: 34,
        });

        expect(result).toEqual(mockSettings);
        expect(mockClient.getDeviceGroupDataSourceAlertSettings).toHaveBeenCalledWith(18, 34);
      });
    });

    describe('update_resource_group_datasource_thresholds', () => {
      // The write endpoint 400s if alertTransitionInterval/alertClearTransitionInterval/alertForNoData
      // are missing or -1 (the "inherited" value the read endpoint reports), so the handler fetches
      // current settings first and backfills them - callers only ever supply alertExpr/disableAlerting.
      const currentSettings = {
        datasourceType: 'DS',
        dpConfig: [
          {
            dataPointId: 297,
            dataPointName: 'DaysRemaining',
            alertExpr: '',
            disableAlerting: false,
            globalAlertExpr: '< 28 7 2',
            alertTransitionInterval: -1,
            alertClearTransitionInterval: -1,
            alertForNoData: -1,
            globalAlertTransitionInterval: 0,
            globalAlertClearTransitionInterval: 0,
            globalAlertForNoData: 1,
          },
          {
            dataPointId: 298,
            dataPointName: 'ChainLength',
            alertExpr: '',
            disableAlerting: false,
            globalAlertExpr: '',
            alertTransitionInterval: 5,
            alertClearTransitionInterval: 5,
            alertForNoData: 2,
            globalAlertTransitionInterval: 0,
            globalAlertClearTransitionInterval: 0,
            globalAlertForNoData: 1,
          },
        ],
      };

      it('should set a group-level threshold override omitting the critical level, backfilling required fields from the global defaults', async () => {
        mockClient.getDeviceGroupDataSourceAlertSettings.mockResolvedValue(currentSettings);
        mockClient.updateDeviceGroupDataSourceAlertSettings.mockResolvedValue({ datasourceType: 'DS', dpConfig: [] });

        await handlers.handleToolCall('update_resource_group_datasource_thresholds', {
          groupId: 18,
          dataSourceId: 34,
          dpConfig: [{ dataPointName: 'DaysRemaining', alertExpr: '< 28 7' }],
        });

        expect(mockClient.getDeviceGroupDataSourceAlertSettings).toHaveBeenCalledWith(18, 34);
        expect(mockClient.updateDeviceGroupDataSourceAlertSettings).toHaveBeenCalledWith(18, 34, [
          {
            dataPointId: 297,
            dataPointName: 'DaysRemaining',
            alertExpr: '< 28 7',
            disableAlerting: false,
            alertTransitionInterval: 0,
            alertClearTransitionInterval: 0,
            alertForNoData: 1,
          },
        ]);
      });

      it('should preserve an existing non-default transition interval instead of resetting it to global', async () => {
        mockClient.getDeviceGroupDataSourceAlertSettings.mockResolvedValue(currentSettings);
        mockClient.updateDeviceGroupDataSourceAlertSettings.mockResolvedValue({ datasourceType: 'DS', dpConfig: [] });

        await handlers.handleToolCall('update_resource_group_datasource_thresholds', {
          groupId: 18,
          dataSourceId: 34,
          dpConfig: [{ dataPointId: 298, alertExpr: '> 5' }],
        });

        expect(mockClient.updateDeviceGroupDataSourceAlertSettings).toHaveBeenCalledWith(18, 34, [
          {
            dataPointId: 298,
            dataPointName: 'ChainLength',
            alertExpr: '> 5',
            disableAlerting: false,
            alertTransitionInterval: 5,
            alertClearTransitionInterval: 5,
            alertForNoData: 2,
          },
        ]);
      });

      it('should reject a datapoint that does not exist on the datasource', async () => {
        mockClient.getDeviceGroupDataSourceAlertSettings.mockResolvedValue(currentSettings);

        await expect(handlers.handleToolCall('update_resource_group_datasource_thresholds', {
          groupId: 18,
          dataSourceId: 34,
          dpConfig: [{ dataPointName: 'NoSuchDataPoint', alertExpr: '> 1' }],
        })).rejects.toThrow(MCPError);

        expect(mockClient.updateDeviceGroupDataSourceAlertSettings).not.toHaveBeenCalled();
      });
    });
  });

  describe('Dashboards', () => {
    describe('list_dashboards', () => {
      it('should list dashboards', async () => {
        const mockResponse = {
          items: [{ id: 1, name: 'test-dashboard' }],
          total: 1,
        };

        mockClient.listDashboards.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_dashboards', {});

        expect(result.items).toHaveLength(1);
      });
    });

    describe('get_dashboard', () => {
      it('should get dashboard by ID', async () => {
        const mockDashboard = { id: 1, name: 'test-dashboard' };
        mockClient.getDashboard.mockResolvedValue(mockDashboard);

        const result = await handlers.handleToolCall('get_dashboard', {
          dashboardId: 1,
        });

        expect(result).toEqual(mockDashboard);
      });
    });

    describe('create_dashboard', () => {
      it('should create dashboard', async () => {
        const mockDashboard = { id: 1, name: 'new-dashboard' };
        mockClient.createDashboard.mockResolvedValue(mockDashboard);

        const result = await handlers.handleToolCall('create_dashboard', {
          name: 'new-dashboard',
        });

        expect(result).toEqual(mockDashboard);
        expect(mockClient.createDashboard).toHaveBeenCalledWith({
          name: 'new-dashboard',
        });
      });

      it('should create dashboard with optional properties', async () => {
        const mockDashboard = { id: 1, name: 'new-dashboard' };
        mockClient.createDashboard.mockResolvedValue(mockDashboard);

        await handlers.handleToolCall('create_dashboard', {
          name: 'new-dashboard',
          description: 'Test dashboard',
          groupId: 2,
          widgetsConfig: [],
        });

        expect(mockClient.createDashboard).toHaveBeenCalledWith({
          name: 'new-dashboard',
          description: 'Test dashboard',
          groupId: 2,
          widgetsConfig: [],
        });
      });
    });

    describe('update_dashboard', () => {
      it('should update dashboard', async () => {
        const mockDashboard = { id: 1, name: 'updated-dashboard' };
        mockClient.updateDashboard.mockResolvedValue(mockDashboard);

        const result = await handlers.handleToolCall('update_dashboard', {
          dashboardId: 1,
          name: 'updated-dashboard',
        });

        expect(result).toEqual(mockDashboard);
        expect(mockClient.updateDashboard).toHaveBeenCalledWith(1, {
          name: 'updated-dashboard',
        });
      });
    });

    describe('delete_dashboard', () => {
      it('should delete dashboard', async () => {
        mockClient.deleteDashboard.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_dashboard', {
          dashboardId: 1,
        });

        expect(result).toEqual({});
      });
    });

    describe('Deeplinks', () => {
      it('should generate dashboard deeplink', async () => {
        const mockDeeplink = {
          url: 'https://example.com/dashboard/1',
          dashboard: { id: 1, name: 'test' },
          groupPath: [],
        };
        mockClient.generateDashboardLink.mockResolvedValue(mockDeeplink);

        const result = await handlers.handleToolCall('generate_dashboard_link', {
          dashboardId: 1,
        });

        expect(result).toEqual(mockDeeplink);
      });

      it('should generate resource deeplink', async () => {
        const mockDeeplink = {
          url: 'https://example.com/device/1',
          device: { id: 1, displayName: 'test' },
          groupPath: [],
        };
        mockClient.generateResourceLink.mockResolvedValue(mockDeeplink);

        const result = await handlers.handleToolCall('generate_resource_link', {
          deviceId: 1,
        });

        expect(result).toEqual(mockDeeplink);
      });

      it('should generate alert deeplink', async () => {
        const mockDeeplink = {
          url: 'https://example.com/alert/1',
          alert: { id: 'alert1', severity: 'error' },
        };
        mockClient.generateAlertLink.mockResolvedValue(mockDeeplink);

        const result = await handlers.handleToolCall('generate_alert_link', {
          alertId: 'alert1',
        });

        expect(result).toEqual(mockDeeplink);
      });

      it('should generate website deeplink', async () => {
        const mockDeeplink = {
          url: 'https://example.com/website/1',
          website: { id: 1, name: 'test' },
          groupPath: [],
        };
        mockClient.generateWebsiteLink.mockResolvedValue(mockDeeplink);

        const result = await handlers.handleToolCall('generate_website_link', {
          websiteId: 1,
        });

        expect(result).toEqual(mockDeeplink);
      });
    });
  });

  describe('Widgets', () => {
    describe('list_widgets', () => {
      it('should list widgets', async () => {
        const mockResponse = {
          items: [{ id: 1, name: 'test-widget', type: 'html' }],
          total: 1,
        };

        mockClient.listWidgets.mockResolvedValue(mockResponse);

        const result = await handlers.handleToolCall('list_widgets', {});

        expect(result.items).toHaveLength(1);
      });

      it('should list widgets scoped to a dashboard', async () => {
        const mockResponse = {
          items: [{ id: 1, name: 'test-widget', type: 'html', dashboardId: 5 }],
          total: 1,
        };

        mockClient.listWidgets.mockResolvedValue(mockResponse);

        await handlers.handleToolCall('list_widgets', { dashboardId: 5 });

        expect(mockClient.listWidgets).toHaveBeenCalledWith(
          expect.objectContaining({ dashboardId: 5 }),
        );
      });
    });

    describe('get_widget', () => {
      it('should get widget by ID', async () => {
        const mockWidget = { id: 1, name: 'test-widget', type: 'html' };
        mockClient.getWidget.mockResolvedValue(mockWidget);

        const result = await handlers.handleToolCall('get_widget', {
          widgetId: 1,
        });

        expect(result).toEqual(mockWidget);
      });
    });

    describe('create_widget', () => {
      it('should create widget', async () => {
        const mockWidget = { id: 1, name: 'new-widget', type: 'html', dashboardId: 5 };
        mockClient.createWidget.mockResolvedValue(mockWidget);

        const result = await handlers.handleToolCall('create_widget', {
          dashboardId: 5,
          name: 'new-widget',
          type: 'html',
        });

        expect(result).toEqual(mockWidget);
        expect(mockClient.createWidget).toHaveBeenCalledWith({
          dashboardId: 5,
          name: 'new-widget',
          type: 'html',
        });
      });

      it('should merge type-specific config into the widget payload', async () => {
        const mockWidget = { id: 1, name: 'new-widget', type: 'html' };
        mockClient.createWidget.mockResolvedValue(mockWidget);

        await handlers.handleToolCall('create_widget', {
          dashboardId: 5,
          name: 'new-widget',
          type: 'html',
          config: { html: '<div>hi</div>' },
        });

        expect(mockClient.createWidget).toHaveBeenCalledWith({
          dashboardId: 5,
          name: 'new-widget',
          type: 'html',
          html: '<div>hi</div>',
        });
      });
    });

    describe('update_widget', () => {
      it('should update widget', async () => {
        const mockWidget = { id: 1, name: 'updated-widget' };
        mockClient.updateWidget.mockResolvedValue(mockWidget);

        const result = await handlers.handleToolCall('update_widget', {
          widgetId: 1,
          name: 'updated-widget',
        });

        expect(result).toEqual(mockWidget);
        expect(mockClient.updateWidget).toHaveBeenCalledWith(1, {
          name: 'updated-widget',
        });
      });
    });

    describe('delete_widget', () => {
      it('should delete widget', async () => {
        mockClient.deleteWidget.mockResolvedValue({});

        const result = await handlers.handleToolCall('delete_widget', {
          widgetId: 1,
        });

        expect(result).toEqual({});
      });
    });

    describe('get_widget_data', () => {
      it('should get widget data', async () => {
        const mockData = { time: [1, 2], values: { value: [10, 20] } };
        mockClient.getWidgetData.mockResolvedValue(mockData);

        const result = await handlers.handleToolCall('get_widget_data', {
          widgetId: 1,
        });

        expect(result).toEqual(mockData);
      });
    });
  });

  describe('Dashboard Groups', () => {
    it('should list dashboard groups', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-group' }], total: 1 };
      mockClient.listDashboardGroups.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_dashboard_groups', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get dashboard group', async () => {
      const mockGroup = { id: 1, name: 'test-group' };
      mockClient.getDashboardGroup.mockResolvedValue(mockGroup);

      const result = await handlers.handleToolCall('get_dashboard_group', {
        groupId: 1,
      });

      expect(result).toEqual(mockGroup);
    });
  });

  describe('Reports', () => {
    it('should list reports', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-report' }], total: 1 };
      mockClient.listReports.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_reports', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get report', async () => {
      const mockReport = { id: 1, name: 'test-report' };
      mockClient.getReport.mockResolvedValue(mockReport);

      const result = await handlers.handleToolCall('get_report', {
        reportId: 1,
      });

      expect(result).toEqual(mockReport);
    });
  });

  describe('Websites', () => {
    it('should list websites', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-website' }], total: 1 };
      mockClient.listWebsites.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_websites', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get website', async () => {
      const mockWebsite = { id: 1, name: 'test-website' };
      mockClient.getWebsite.mockResolvedValue(mockWebsite);

      const result = await handlers.handleToolCall('get_website', {
        websiteId: 1,
      });

      expect(result).toEqual(mockWebsite);
    });

    describe('create_website', () => {
      beforeEach(() => {
        mockClient.createWebsite.mockResolvedValue({ id: 1 });
        mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 3, items: [{ id: 2 }, { id: 3 }, { id: 4 }] });
      });

      it('creates an external web check that follows the default locations, with one default step', async () => {
        await handlers.handleToolCall('create_website', { name: 'site', type: 'webcheck', domain: 'www.example.com' });

        const body = mockClient.createWebsite.mock.calls[0][0];
        expect(body).toMatchObject({
          name: 'site',
          type: 'webcheck',
          domain: 'www.example.com',
          schema: 'https',
          isInternal: false,
          useDefaultLocationSetting: true,
          testLocation: { smgIds: [2, 3, 4], collectorIds: [], all: false },
        });
        expect(body.steps).toHaveLength(1);
        expect(body.steps[0]).toMatchObject({ url: '/', HTTPMethod: 'GET', schema: 'https', name: '__step0' });
      });

      it('creates an external ping check', async () => {
        await handlers.handleToolCall('create_website', { name: 'p', type: 'pingcheck', host: '198.51.100.10', count: 10 });

        const body = mockClient.createWebsite.mock.calls[0][0];
        expect(body).toMatchObject({ type: 'pingcheck', host: '198.51.100.10', count: 10, isInternal: false });
        expect(body.steps).toBeUndefined();
        expect(body.domain).toBeUndefined();
      });

      it('creates an internal web check on collectors', async () => {
        await handlers.handleToolCall('create_website', {
          name: 'i', type: 'webcheck', domain: 'intranet.corp.local', schema: 'http', isInternal: true,
          testLocation: { collectorIds: [12] },
        });

        const body = mockClient.createWebsite.mock.calls[0][0];
        expect(body).toMatchObject({ isInternal: true, useDefaultLocationSetting: false, schema: 'http' });
        expect(body.testLocation.collectorIds).toEqual([12]);
        expect(body.testLocation.smgIds).toEqual([]);
        expect(body.steps[0].schema).toBe('http');
        expect(mockClient.listWebsiteCheckpoints).not.toHaveBeenCalled();
      });

      it('creates an internal ping check on collectors', async () => {
        await handlers.handleToolCall('create_website', {
          name: 'ip', type: 'pingcheck', host: '10.0.0.5', isInternal: 'true', testLocation: '{"collectorIds":[12,13]}',
        });

        const body = mockClient.createWebsite.mock.calls[0][0];
        expect(body).toMatchObject({ isInternal: true, host: '10.0.0.5' });
        expect(body.testLocation.collectorIds).toEqual([12, 13]);
      });

      it('rejects an internal check without collectors and an external check with collectors', async () => {
        await expect(handlers.handleToolCall('create_website', {
          name: 'x', type: 'pingcheck', host: 'h', isInternal: true,
        })).rejects.toThrow(/collectorIds is required/);
        await expect(handlers.handleToolCall('create_website', {
          name: 'x', type: 'pingcheck', host: 'h', testLocation: { collectorIds: [1] },
        })).rejects.toThrow(/internal/);
        expect(mockClient.createWebsite).not.toHaveBeenCalled();
      });

      it('rejects settings that do not match the type, and a missing domain or host', async () => {
        await expect(handlers.handleToolCall('create_website', { name: 'x', type: 'webcheck', host: 'h', domain: 'd' }))
          .rejects.toThrow(/host does not apply to a webcheck/);
        await expect(handlers.handleToolCall('create_website', { name: 'x', type: 'pingcheck', host: 'h', domain: 'd' }))
          .rejects.toThrow(/domain does not apply to a pingcheck/);
        await expect(handlers.handleToolCall('create_website', { name: 'x', type: 'webcheck' }))
          .rejects.toThrow(/domain is required/);
        await expect(handlers.handleToolCall('create_website', { name: 'x', type: 'pingcheck' }))
          .rejects.toThrow(/host is required/);
        expect(mockClient.createWebsite).not.toHaveBeenCalled();
      });
    });

    describe('update_website', () => {
      beforeEach(() => {
        mockClient.updateWebsite.mockResolvedValue({ id: 1 });
        mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 2, items: [{ id: 2 }, { id: 3 }] });
      });

      it('sends only the fields that were given, coercing loosely typed values', async () => {
        const result = await handlers.handleToolCall('update_website', { websiteId: 1, name: 'n', stopMonitoring: 'true', pollingInterval: '3' });

        expect(result).toEqual({ id: 1 });
        expect(mockClient.updateWebsite).toHaveBeenCalledWith(1, { name: 'n', stopMonitoring: true, pollingInterval: 3 }, undefined);
        expect(mockClient.getWebsite).not.toHaveBeenCalled();
      });

      it('passes opType and normalizes steps', async () => {
        await handlers.handleToolCall('update_website', { websiteId: 1, opType: 'add', steps: '[{"url":"/health"}]' });

        const [, body, params] = mockClient.updateWebsite.mock.calls[0];
        expect(params).toEqual({ opType: 'add' });
        expect(body.steps[0]).toMatchObject({ url: '/health', HTTPMethod: 'GET', name: '__step0' });
      });

      it('looks up whether the website is internal when only testLocation changes', async () => {
        mockClient.getWebsite.mockResolvedValue({ isInternal: true });

        await handlers.handleToolCall('update_website', { websiteId: 1, testLocation: { collectorIds: [5] } });

        expect(mockClient.getWebsite).toHaveBeenCalledWith(1, { fields: 'isInternal' });
        const [, body] = mockClient.updateWebsite.mock.calls[0];
        expect(body).toMatchObject({ isInternal: true, useDefaultLocationSetting: false });
        expect(body.testLocation.collectorIds).toEqual([5]);
      });

      it('rejects invalid settings before calling the API', async () => {
        await expect(handlers.handleToolCall('update_website', { websiteId: 1, pollingInterval: 20 })).rejects.toThrow(/pollingInterval/);
        await expect(handlers.handleToolCall('update_website', { websiteId: 1, overallAlertLevel: 'loud' })).rejects.toThrow(/overallAlertLevel/);
        expect(mockClient.updateWebsite).not.toHaveBeenCalled();
      });
    });

    describe('get_website_checkpoint_data', () => {
      it('zips the parallel arrays into rows and normalizes the time range', async () => {
        mockClient.getWebsiteCheckpointData.mockResolvedValue({
          dataPoints: ['status', 'responseTime'],
          values: [[11, 72], [11, 'No Data']],
          time: [1792605106000, 1792604806000],
          nextPageParams: '',
        });

        const result = await handlers.handleToolCall('get_website_checkpoint_data', {
          websiteId: 57, checkpointId: 99, start: 1792601506000, end: 1792605106, datapoints: ['status', 'responseTime'],
        });

        expect(mockClient.getWebsiteCheckpointData).toHaveBeenCalledWith(57, 99, {
          start: 1792601506, end: 1792605106, period: undefined, datapoints: 'status,responseTime',
        });
        expect(result.dataPoints).toEqual(['status', 'responseTime']);
        expect(result.rows).toEqual([
          { time: '2026-10-21T17:51:46.000Z', status: 11, responseTime: 72 },
          { time: '2026-10-21T17:46:46.000Z', status: 11, responseTime: 'No Data' },
        ]);
        expect(result.nextPageParams).toBeUndefined();
      });

      it('passes through a response it does not recognise', async () => {
        mockClient.getWebsiteCheckpointData.mockResolvedValue({ unexpected: true });
        const result = await handlers.handleToolCall('get_website_checkpoint_data', { websiteId: 1, checkpointId: 2, period: 6 });
        expect(result).toEqual({ unexpected: true });
      });
    });

    describe('website groups and website sub-resources', () => {
      it('creates a website group under the root by default and under a parent when given', async () => {
        mockClient.createWebsiteGroup.mockResolvedValue({ id: 1 });

        await handlers.handleToolCall('create_website_group', { name: 'g' });
        expect(mockClient.createWebsiteGroup.mock.calls[0][0]).toEqual({ name: 'g', parentId: 1 });

        await handlers.handleToolCall('create_website_group', { name: 'g2', parentId: 30, description: 'd', disableAlerting: 'true' });
        expect(mockClient.createWebsiteGroup.mock.calls[1][0]).toEqual({
          name: 'g2', parentId: 30, description: 'd', disableAlerting: true,
        });
      });

      it('updates, moves and deletes a website group', async () => {
        mockClient.updateWebsiteGroup.mockResolvedValue({ id: 1 });
        mockClient.deleteWebsiteGroup.mockResolvedValue({});

        await handlers.handleToolCall('update_website_group', { groupId: 5, name: 'n', parentId: 9, properties: '[{"name":"a","value":"b"}]' });
        expect(mockClient.updateWebsiteGroup).toHaveBeenCalledWith(
          5, { name: 'n', parentId: 9, properties: [{ name: 'a', value: 'b' }] }, undefined);

        await handlers.handleToolCall('delete_website_group', { groupId: 5 });
        expect(mockClient.deleteWebsiteGroup).toHaveBeenCalledWith(5);
      });

      it('lists websites in a group with the default fields, and the other sub-resources', async () => {
        mockClient.listWebsiteGroupWebsites.mockResolvedValue({ total: 1, items: [{ id: 1, name: 'w', type: 'webcheck', secret: 'x' }] });
        mockClient.listWebsiteAlerts.mockResolvedValue({ total: 0, items: [] });
        mockClient.listWebsiteProperties.mockResolvedValue({ total: 0, items: [] });
        mockClient.listWebsiteSdts.mockResolvedValue({ total: 0, items: [] });
        mockClient.listWebsiteGroupSdts.mockResolvedValue({ total: 0, items: [] });

        const result = await handlers.handleToolCall('list_website_group_websites', { groupId: 4 });
        expect(result.items[0]).toEqual({ id: 1, name: 'w', type: 'webcheck' });
        expect(mockClient.listWebsiteGroupWebsites.mock.calls[0][0]).toBe(4);

        await handlers.handleToolCall('list_website_alerts', { websiteId: 7, needMessage: 'true', size: 5 });
        expect(mockClient.listWebsiteAlerts).toHaveBeenCalledWith(7, expect.objectContaining({ needMessage: true, size: 5 }));
        await handlers.handleToolCall('list_website_properties', { websiteId: 7 });
        await handlers.handleToolCall('list_website_sdts', { websiteId: 7 });
        await handlers.handleToolCall('list_website_group_sdts', { groupId: 4 });
        expect(mockClient.listWebsiteProperties.mock.calls[0][0]).toBe(7);
        expect(mockClient.listWebsiteSdts.mock.calls[0][0]).toBe(7);
        expect(mockClient.listWebsiteGroupSdts.mock.calls[0][0]).toBe(4);
      });
    });

    it('should delete website', async () => {
      mockClient.deleteWebsite.mockResolvedValue({});

      const result = await handlers.handleToolCall('delete_website', {
        websiteId: 1,
      });

      expect(result).toEqual({});
    });

    it('should create an uptime check with a content-match step', async () => {
      const mockDevice = { id: 1, displayName: 'Portal Login Page' };
      mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 2, items: [{ id: 2 }, { id: 4 }] });
      mockClient.createDevice.mockResolvedValue(mockDevice);

      const result = await handlers.handleToolCall('create_uptime_check', {
        displayName: 'Portal Login Page',
        name: 'Portal Login Page',
        domain: 'example.com/login',
        steps: [
          { name: 'Check login form', url: '/', keyword: 'id="username"', statusCode: '200' },
        ],
      });

      expect(result).toEqual(mockDevice);
      expect(mockClient.createDevice).toHaveBeenCalledWith({
        type: 'uptimewebcheck',
        displayName: 'Portal Login Page',
        name: 'Portal Login Page',
        domain: 'example.com/login',
        testLocation: { collectorIds: [], smgIds: [2, 4], all: false },
        useDefaultLocationSetting: true,
        isInternal: false,
        useDefaultAlertSetting: true,
        steps: [
          {
            HTTPMethod: 'GET',
            matchType: 'plain',
            enable: true,
            followRedirection: true,
            name: 'Check login form',
            url: '/',
            keyword: 'id="username"',
            statusCode: '200',
          },
        ],
      });
    });

    it('should create an uptime check with explicit testLocation and no steps', async () => {
      const mockDevice = { id: 2, displayName: 'Simple ping' };
      mockClient.createDevice.mockResolvedValue(mockDevice);

      const result = await handlers.handleToolCall('create_uptime_check', {
        displayName: 'Simple ping',
        name: 'Simple ping',
        domain: 'example.com',
        testLocation: { smgIds: [2, 3] },
      });

      expect(result).toEqual(mockDevice);
      expect(mockClient.createDevice).toHaveBeenCalledWith({
        type: 'uptimewebcheck',
        displayName: 'Simple ping',
        name: 'Simple ping',
        domain: 'example.com',
        testLocation: { collectorIds: [], smgIds: [2, 3], all: false },
        useDefaultLocationSetting: false,
        isInternal: false,
        useDefaultAlertSetting: true,
      });
    });

    it('should create an internal uptime check with an explicit collector', async () => {
      const mockDevice = { id: 3, displayName: 'Internal app check' };
      mockClient.createDevice.mockResolvedValue(mockDevice);

      const result = await handlers.handleToolCall('create_uptime_check', {
        displayName: 'Internal app check',
        name: 'Internal app check',
        domain: 'internal.example.com',
        testLocation: { collectorIds: [5] },
        isInternal: true,
        preferredCollectorId: 5,
      });

      expect(result).toEqual(mockDevice);
      expect(mockClient.createDevice).toHaveBeenCalledWith({
        type: 'uptimewebcheck',
        displayName: 'Internal app check',
        name: 'Internal app check',
        domain: 'internal.example.com',
        testLocation: { collectorIds: [5], smgIds: [], all: true },
        useDefaultLocationSetting: false,
        isInternal: true,
        useDefaultAlertSetting: true,
        preferredCollectorId: 5,
      });
    });
  });

  describe('Uptime ping checks', () => {
    it('should create an external ping uptime check', async () => {
      mockClient.createDevice.mockResolvedValue({ id: 10 });

      await handlers.handleToolCall('create_uptime_check', {
        checkType: 'ping',
        displayName: 'Google',
        name: 'Google',
        host: '8.8.8.8',
        hostGroupIds: '17, 18',
        testLocation: { smgIds: [2, 4] },
      });

      expect(mockClient.createDevice).toHaveBeenCalledWith(
        {
          type: 'uptimepingcheck',
          model: 'websiteDevice',
          deviceType: 19,
          id: 0,
          name: 'Google',
          displayName: 'Google',
          host: '8.8.8.8',
          count: 5,
          percentPktsNotReceiveInTime: 80,
          timeoutInMSPktsNotReceive: 500,
          isInternal: false,
          useDefaultAlertSetting: true,
          useDefaultLocationSetting: false,
          testLocation: { collectorIds: [], smgIds: [2, 4], all: false },
          groupIds: ['17', '18'],
        },
        { type: 'uptimepingcheck' },
      );
    });

    it('should follow default locations (filled with enabled checkpoints) when no external locations are given', async () => {
      mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 3,
        items: [{ id: 2, isEnabledInRoot: true }, { id: 3, isEnabledInRoot: false }, { id: 4, isEnabledInRoot: true }],
      });
      mockClient.createDevice.mockResolvedValue({ id: 11 });
      for (const testLocation of [undefined, { all: true }]) {
        mockClient.createDevice.mockClear();
        await handlers.handleToolCall('create_uptime_check', {
          checkType: 'ping', displayName: 'g', name: 'g', host: '8.8.8.8', testLocation,
        });
        const payload = mockClient.createDevice.mock.calls[0][0];
        expect(payload.useDefaultLocationSetting).toBe(true);
        expect(payload.testLocation).toEqual({ collectorIds: [], smgIds: [2, 4], all: false });
      }
    });

    it('should only send pollingInterval with custom alert settings', async () => {
      mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 1, items: [{ id: 2 }] });
      mockClient.createDevice.mockResolvedValue({ id: 13 });
      const args = { checkType: 'ping', displayName: 'p', name: 'p', host: '8.8.8.8' };

      await handlers.handleToolCall('create_uptime_check', args);
      let payload = mockClient.createDevice.mock.calls[0][0];
      expect(payload.useDefaultAlertSetting).toBe(true);
      expect('pollingInterval' in payload).toBe(false);

      await handlers.handleToolCall('create_uptime_check', { ...args, pollingInterval: 1 });
      payload = mockClient.createDevice.mock.calls[1][0];
      expect(payload.useDefaultAlertSetting).toBe(false);
      expect(payload.pollingInterval).toBe(1);

      await expect(
        handlers.handleToolCall('create_uptime_check', { ...args, pollingInterval: 1, useDefaultAlertSetting: true }),
      ).rejects.toThrow(/pollingInterval cannot be combined/);
    });

    it('should create an internal ping check', async () => {
      mockClient.createDevice.mockResolvedValue({ id: 12 });
      await handlers.handleToolCall('create_uptime_check', {
        checkType: 'ping', displayName: 'i', name: 'i', host: 'intranet.local',
        isInternal: true, testLocation: { collectorIds: [5] },
      });
      const payload = mockClient.createDevice.mock.calls[0][0];
      expect(payload.isInternal).toBe(true);
      expect(payload.testLocation).toEqual({ collectorIds: [5], smgIds: [], all: true });
    });

    it('should reject invalid ping configurations', async () => {
      const base = { checkType: 'ping', displayName: 'x', name: 'x' };
      await expect(handlers.handleToolCall('create_uptime_check', base)).rejects.toThrow(/host is required/);
      await expect(handlers.handleToolCall('create_uptime_check', { ...base, host: 'h', count: 7 })).rejects.toThrow(/count/);
      await expect(handlers.handleToolCall('create_uptime_check', { ...base, host: 'h', isInternal: true })).rejects.toThrow(/collectorIds is required/);
      await expect(handlers.handleToolCall('create_uptime_check', { ...base, host: 'h', testLocation: { collectorIds: [1] } })).rejects.toThrow(/internal/);
      expect(mockClient.createDevice).not.toHaveBeenCalled();
    });

    it('should require domain for web checks', async () => {
      await expect(handlers.handleToolCall('create_uptime_check', { displayName: 'x', name: 'x' })).rejects.toThrow(/domain is required/);
    });
  });

  describe('Uptime check updates', () => {
    const pingDevice = { id: 50, type: 'uptimepingcheck', isInternal: false };
    const webDevice = { id: 51, type: 'uptimewebcheck', isInternal: false };
    const internalDevice = { id: 52, type: 'uptimepingcheck', isInternal: true };

    beforeEach(() => {
      mockClient.updateDevice.mockResolvedValue({ id: 50 });
      mockClient.listWebsiteCheckpoints.mockResolvedValue({ total: 2, items: [{ id: 2 }, { id: 4 }] });
    });

    it('should send only the changed fields', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 50, host: '1.1.1.1', count: 10 });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(50, { host: '1.1.1.1', count: 10 }, { opType: 'replace' });
    });

    it('should switch to custom alert settings when only an interval is given', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 50, pollingInterval: 1 });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(
        50, { pollingInterval: 1, useDefaultAlertSetting: false }, { opType: 'replace' });
    });

    it('should return to default alert settings without an interval', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 50, useDefaultAlertSetting: true });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(50, { useDefaultAlertSetting: true }, { opType: 'replace' });
    });

    it('should reject an interval combined with default alert settings', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await expect(handlers.handleToolCall('update_uptime_check', {
        deviceId: 50, pollingInterval: 1, useDefaultAlertSetting: true,
      })).rejects.toThrow(/pollingInterval cannot be combined/);
    });

    it('should switch an external check back to default locations with all: true', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 50, testLocation: { all: true } });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(50, {
        useDefaultLocationSetting: true,
        testLocation: { collectorIds: [], smgIds: [2, 4], all: false },
      }, { opType: 'replace' });
    });

    it('should pin specific checkpoints', async () => {
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 50, testLocation: { smgIds: [3] } });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(50, {
        useDefaultLocationSetting: false,
        testLocation: { collectorIds: [], smgIds: [3], all: false },
      }, { opType: 'replace' });
    });

    it('should change collectors on an internal check and reject checkpoints', async () => {
      mockClient.getDevice.mockResolvedValue(internalDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 52, testLocation: { collectorIds: [7] } });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(52, {
        useDefaultLocationSetting: false,
        testLocation: { collectorIds: [7], smgIds: [], all: true },
      }, { opType: 'replace' });
      await expect(handlers.handleToolCall('update_uptime_check', { deviceId: 52, testLocation: { smgIds: [2] } }))
        .rejects.toThrow(/only valid for external/);
    });

    it('should apply step defaults and reject ping-only fields on web checks', async () => {
      mockClient.getDevice.mockResolvedValue(webDevice);
      await handlers.handleToolCall('update_uptime_check', { deviceId: 51, domain: 'example.org', steps: [{ url: '/x' }] });
      expect(mockClient.updateDevice).toHaveBeenCalledWith(51, {
        domain: 'example.org',
        steps: [{ HTTPMethod: 'GET', matchType: 'plain', enable: true, followRedirection: true, url: '/x' }],
      }, { opType: 'replace' });
      await expect(handlers.handleToolCall('update_uptime_check', { deviceId: 51, host: 'h' })).rejects.toThrow(/only apply to ping/);
    });

    it('should reject non-uptime resources, ping/web mismatches and empty updates', async () => {
      mockClient.getDevice.mockResolvedValue({ id: 9, type: 'server' });
      await expect(handlers.handleToolCall('update_uptime_check', { deviceId: 9, host: 'h' })).rejects.toThrow(/not an LM Uptime check/);
      mockClient.getDevice.mockResolvedValue(pingDevice);
      await expect(handlers.handleToolCall('update_uptime_check', { deviceId: 50, domain: 'x.com' })).rejects.toThrow(/only apply to web/);
      await expect(handlers.handleToolCall('update_uptime_check', { deviceId: 50 })).rejects.toThrow(/No changes/);
      expect(mockClient.updateDevice).not.toHaveBeenCalled();
    });
  });

  describe('Website Groups', () => {
    it('should list website groups', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-group' }], total: 1 };
      mockClient.listWebsiteGroups.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_website_groups', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get website group', async () => {
      const mockGroup = { id: 1, name: 'test-group' };
      mockClient.getWebsiteGroup.mockResolvedValue(mockGroup);

      const result = await handlers.handleToolCall('get_website_group', {
        groupId: 1,
      });

      expect(result).toEqual(mockGroup);
    });
  });

  describe('Users and Roles', () => {
    it('should list users', async () => {
      const mockResponse = { items: [{ id: 1, username: 'test-user' }], total: 1 };
      mockClient.listUsers.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_users', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get user', async () => {
      const mockUser = { id: 1, username: 'test-user' };
      mockClient.getUser.mockResolvedValue(mockUser);

      const result = await handlers.handleToolCall('get_user', {
        userId: 1,
      });

      expect(result).toEqual(mockUser);
    });

    it('should list roles', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-role' }], total: 1 };
      mockClient.listRoles.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_roles', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get role', async () => {
      const mockRole = { id: 1, name: 'test-role' };
      mockClient.getRole.mockResolvedValue(mockRole);

      const result = await handlers.handleToolCall('get_role', {
        roleId: 1,
      });

      expect(result).toEqual(mockRole);
    });
  });

  describe('API Tokens', () => {
    it('should list api tokens', async () => {
      const mockResponse = { items: [{ adminId: 1, accessId: 'abc123' }], total: 1 };
      mockClient.listApiTokens.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_api_tokens', {
        userId: 1,
      });

      expect(result.items).toHaveLength(1);
    });
  });

  describe('SDTs', () => {
    it('should list SDTs', async () => {
      const mockResponse = { items: [{ id: 1, type: 'device' }], total: 1 };
      mockClient.listSDTs.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_sdts', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get SDT', async () => {
      const mockSDT = { id: 1, type: 'device' };
      mockClient.getSDT.mockResolvedValue(mockSDT);

      const result = await handlers.handleToolCall('get_sdt', {
        sdtId: 1,
      });

      expect(result).toEqual(mockSDT);
    });

    it('should create device SDT', async () => {
      const mockSDT = { id: 1, deviceId: 123 };
      mockClient.createDeviceSDT.mockResolvedValue(mockSDT);

      const result = await handlers.handleToolCall('create_resource_sdt', {
        deviceId: 123,
        type: 1,
        startDateTime: 1791494000000,
        endDateTime: 1791497600000,
      });

      expect(result).toEqual(mockSDT);
      expect(mockClient.createDeviceSDT).toHaveBeenCalledWith({
        sdtType: 1,
        deviceId: 123,
        type: 1,
        startDateTime: 1791494000000,
        endDateTime: 1791497600000,
      });
    });

    it('should create device SDT with comment', async () => {
      const mockSDT = { id: 1, deviceId: 123 };
      mockClient.createDeviceSDT.mockResolvedValue(mockSDT);

      await handlers.handleToolCall('create_resource_sdt', {
        deviceId: 123,
        type: 1,
        startDateTime: 1791494000000,
        endDateTime: 1791497600000,
        comment: 'Maintenance window',
      });

      expect(mockClient.createDeviceSDT).toHaveBeenCalledWith({
        sdtType: 1,
        deviceId: 123,
        type: 1,
        startDateTime: 1791494000000,
        endDateTime: 1791497600000,
        comment: 'Maintenance window',
      });
    });

    it('should convert epoch seconds to milliseconds for SDT times', async () => {
      mockClient.createDeviceSDT.mockResolvedValue({ id: 1 });

      await handlers.handleToolCall('create_resource_sdt', {
        deviceId: 123,
        type: 1,
        startDateTime: 1791494000,
        endDateTime: 1791497600,
      });

      expect(mockClient.createDeviceSDT).toHaveBeenCalledWith(expect.objectContaining({
        startDateTime: 1791494000000,
        endDateTime: 1791497600000,
      }));
    });

    it('should delete SDT', async () => {
      mockClient.deleteSDT.mockResolvedValue({});

      const result = await handlers.handleToolCall('delete_sdt', {
        sdtId: 1,
      });

      expect(result).toEqual({});
    });
  });

  describe('ConfigSources', () => {
    it('should list configsources', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-config' }], total: 1 };
      mockClient.listConfigSources.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_configsources', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get configsource', async () => {
      const mockConfigSource = { id: 1, name: 'test-config' };
      mockClient.getConfigSource.mockResolvedValue(mockConfigSource);

      const result = await handlers.handleToolCall('get_configsource', {
        configSourceId: 1,
      });

      expect(result).toEqual(mockConfigSource);
    });

    it('should create a configsource', async () => {
      const mockCreated = { id: 5, name: 'MyConfig' };
      mockClient.createConfigSource.mockResolvedValue(mockCreated);

      const result = await handlers.handleToolCall('create_configsource', {
        name: 'MyConfig',
        collectMethod: 'batchscript',
        collectInterval: 3600,
        collectorAttribute: { name: 'batchscript', groovyScript: 'return 0' },
      });

      expect(mockClient.createConfigSource).toHaveBeenCalledWith(expect.objectContaining({
        name: 'MyConfig',
        collectMethod: 'batchscript',
        collectInterval: 3600,
        collectorAttribute: { name: 'batchscript', groovyScript: 'return 0' },
      }));
      expect(result).toEqual(mockCreated);
    });

    describe('get_configsource_scripts', () => {
      it('should extract collection and discovery scripts', async () => {
        mockClient.getConfigSource.mockResolvedValue({
          id: 7,
          collectorAttribute: { name: 'script', scriptType: 'embed', groovyScript: 'println 1' },
          autoDiscoveryConfig: { method: { name: 'ad_script', groovyScript: 'println "a##b"' } },
          configChecks: [{ name: 'x', type: 'fetch' }],
        });

        const result = await handlers.handleToolCall('get_configsource_scripts', { configSourceId: 7 });

        expect(mockClient.getConfigSource).toHaveBeenCalledWith(7);
        expect(result.configSourceId).toBe(7);
        expect(result.scripts).toEqual([
          {
            location: 'collectorAttribute (collection method)',
            field: 'groovyScript',
            language: 'groovy',
            scriptType: 'embed',
            content: 'println 1',
          },
          {
            location: 'autoDiscoveryConfig.method (discovery method)',
            field: 'groovyScript',
            language: 'groovy',
            content: 'println "a##b"',
          },
        ]);
      });

      it('should return an empty list when there are no scripts', async () => {
        mockClient.getConfigSource.mockResolvedValue({ id: 8, collectorAttribute: { name: 'snmp' } });
        const result = await handlers.handleToolCall('get_configsource_scripts', { configSourceId: 8 });
        expect(result.scripts).toEqual([]);
      });

      it('should propagate API errors', async () => {
        mockClient.getConfigSource.mockRejectedValue(new Error('404 Not Found'));
        await expect(handlers.handleToolCall('get_configsource_scripts', { configSourceId: 999 }))
          .rejects.toThrow('404 Not Found');
      });
    });

    describe('update_configsource', () => {
      it('should send only the given fields, without the id', async () => {
        const mockUpdated = { id: 5, description: 'updated' };
        mockClient.updateConfigSource.mockResolvedValue(mockUpdated);

        const result = await handlers.handleToolCall('update_configsource', {
          configSourceId: 5,
          description: 'updated',
        });

        expect(mockClient.updateConfigSource).toHaveBeenCalledWith(5, { description: 'updated' });
        expect(result).toEqual(mockUpdated);
      });

      it('should pass configChecks through unchanged', async () => {
        mockClient.updateConfigSource.mockResolvedValue({ id: 5 });
        const configChecks = [
          { id: 1, name: 'cantRetrieve', type: 'fetch' },
          { name: 'anyChange', type: 'ignore', alertLevel: 1, alertEffectiveIval: 60, ackClearAlert: true },
        ];

        await handlers.handleToolCall('update_configsource', { configSourceId: 5, configChecks });

        expect(mockClient.updateConfigSource).toHaveBeenCalledWith(5, { configChecks });
      });

      it('should propagate API errors', async () => {
        mockClient.updateConfigSource.mockRejectedValue(new Error('400 Bad Request'));
        await expect(handlers.handleToolCall('update_configsource', { configSourceId: 5, fileFormat: 'bogus' }))
          .rejects.toThrow('400 Bad Request');
      });

      it('should send an empty body when only the id is given (no id leaked into the payload)', async () => {
        mockClient.updateConfigSource.mockResolvedValue({ id: 5 });
        await handlers.handleToolCall('update_configsource', { configSourceId: 5 });
        expect(mockClient.updateConfigSource).toHaveBeenCalledWith(5, {});
      });
    });

    describe('delete_configsource', () => {
      it('should delete a configsource by ID', async () => {
        mockClient.deleteConfigSource.mockResolvedValue({});
        const result = await handlers.handleToolCall('delete_configsource', { configSourceId: 5 });
        expect(mockClient.deleteConfigSource).toHaveBeenCalledWith(5);
        expect(result).toEqual({});
      });

      it('should propagate API errors', async () => {
        mockClient.deleteConfigSource.mockRejectedValue(new Error('404 Not Found'));
        await expect(handlers.handleToolCall('delete_configsource', { configSourceId: 999 }))
          .rejects.toThrow('404 Not Found');
      });
    });
  });

  describe('PropertySources', () => {
    it('should list propertysources', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-property' }], total: 1 };
      mockClient.listPropertySources.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_propertysources', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get propertysource', async () => {
      const mockPropertySource = { id: 1, name: 'test-property' };
      mockClient.getPropertySource.mockResolvedValue(mockPropertySource);

      const result = await handlers.handleToolCall('get_propertysource', {
        propertySourceId: 1,
      });

      expect(result).toEqual(mockPropertySource);
    });
  });

  describe('Device Properties', () => {
    it('should list device properties', async () => {
      const mockResponse = { items: [{ name: 'prop1', value: 'val1' }], total: 1 };
      mockClient.listDeviceProperties.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_resource_properties', {
        deviceId: 1,
      });

      expect(result.items).toHaveLength(1);
    });

    it('should update device property', async () => {
      mockClient.updateDeviceProperty.mockResolvedValue({});

      const result = await handlers.handleToolCall('update_resource_property', {
        deviceId: 1,
        propertyName: 'test.prop',
        value: 'new-value',
      });

      expect(result).toEqual({});
      expect(mockClient.updateDeviceProperty).toHaveBeenCalledWith(1, 'test.prop', 'new-value');
    });

    it('should delete device property', async () => {
      mockClient.deleteDeviceProperty.mockResolvedValue({});

      await handlers.handleToolCall('delete_resource_property', {
        deviceId: 1,
        propertyName: 'test.prop',
      });

      expect(mockClient.deleteDeviceProperty).toHaveBeenCalledWith(1, 'test.prop');
    });

    it('should delete device group property', async () => {
      mockClient.deleteDeviceGroupProperty.mockResolvedValue({});

      await handlers.handleToolCall('delete_resource_group_property', {
        groupId: 2,
        propertyName: 'test.prop',
      });

      expect(mockClient.deleteDeviceGroupProperty).toHaveBeenCalledWith(2, 'test.prop');
    });

    it('should schedule device discovery', async () => {
      mockClient.scheduleDeviceDiscovery.mockResolvedValue({});

      const result = await handlers.handleToolCall('schedule_resource_discovery', {
        deviceId: 6415,
      });

      expect(result).toEqual({});
      expect(mockClient.scheduleDeviceDiscovery).toHaveBeenCalledWith(6415);
    });
  });

  describe('Query Parameter in List Tools', () => {
    it('should list devices with query parameter', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listResources.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_resources', {
        query: 'server',
      });

      expect(mockClient.listResources).toHaveBeenCalled();
    });

    it('should list alerts with query parameter', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listAlerts.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_alerts', {
        query: 'critical',
      });

      expect(mockClient.listAlerts).toHaveBeenCalled();
    });

    it('should list audit logs with query parameter', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listAuditLogs.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_audit_logs', {
        query: 'user',
      });

      expect(mockClient.listAuditLogs).toHaveBeenCalled();
    });
  });

  describe('Audit Logs', () => {
    it('should list audit logs', async () => {
      const mockResponse = { items: [{ id: 1, description: 'test log' }], total: 1 };
      mockClient.listAuditLogs.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_audit_logs', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get audit log', async () => {
      const mockLog = { id: 1, description: 'test log' };
      mockClient.getAuditLog.mockResolvedValue(mockLog);

      const result = await handlers.handleToolCall('get_audit_log', {
        auditLogId: 1,
      });

      expect(result).toEqual(mockLog);
    });

    it('should throw when combining query and filter (LM API cannot mix OR-expanded query with AND filter)', async () => {
      try {
        await handlers.handleToolCall('list_audit_logs', {
          query: 'WEE',
          filter: 'happenedOn>1730851200',
        });
        throw new Error('expected handleToolCall to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        const mcpError = error as MCPError;
        expect(mcpError.suggestions?.join('\n')).toContain('username~"*WEE*",happenedOn>1730851200');
        expect(mcpError.suggestions?.join('\n')).toContain('description~"*WEE*",happenedOn>1730851200');
        expect(mcpError.suggestions?.join('\n')).toContain('ip~"*WEE*",happenedOn>1730851200');
      }

      expect(mockClient.listAuditLogs).not.toHaveBeenCalled();
    });
  });

  describe('Integration Logs', () => {
    it('should list integration logs', async () => {
      const mockResponse = {
        items: [{ id: 1, happenedOnMs: 1730851200000, integrationName: 'ServiceNow', alertId: 'SV1', alertInstanceId: 'inst1', httpResponseCode: 200 }],
        total: 1,
      };
      mockClient.listIntegrationLogs.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_integration_logs', {});

      expect(result.items).toHaveLength(1);
      expect(mockClient.listIntegrationLogs).toHaveBeenCalled();
    });

    it('should list integration logs with query parameter', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listIntegrationLogs.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_integration_logs', {
        query: 'ServiceNow',
      });

      expect(mockClient.listIntegrationLogs).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'integrationName~"*ServiceNow*"' }),
      );
    });

    it('should pass through sort and filter for integration logs', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listIntegrationLogs.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_integration_logs', {
        filter: 'httpResponseCode!:200',
        sort: '-happenedOnMs',
      });

      expect(mockClient.listIntegrationLogs).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'httpResponseCode!:200', sort: '-happenedOnMs' }),
      );
    });
  });

  describe('Access Groups', () => {
    it('should list access groups', async () => {
      const mockResponse = { items: [{ id: 1, name: 'test-group' }], total: 1 };
      mockClient.listAccessGroups.mockResolvedValue(mockResponse);

      const result = await handlers.handleToolCall('list_access_groups', {});

      expect(result.items).toHaveLength(1);
    });

    it('should get access group', async () => {
      const mockGroup = { id: 1, name: 'test-group' };
      mockClient.getAccessGroup.mockResolvedValue(mockGroup);

      const result = await handlers.handleToolCall('get_access_group', {
        accessGroupId: 1,
      });

      expect(result).toEqual(mockGroup);
    });

    it('should create access group', async () => {
      const mockGroup = { id: 1, name: 'new-group' };
      mockClient.createAccessGroup.mockResolvedValue(mockGroup);

      const result = await handlers.handleToolCall('create_access_group', {
        name: 'new-group',
        description: 'Test group',
      });

      expect(result).toEqual(mockGroup);
    });

    it('should update access group', async () => {
      const mockGroup = { id: 1, name: 'updated-group' };
      mockClient.updateAccessGroup.mockResolvedValue(mockGroup);

      const result = await handlers.handleToolCall('update_access_group', {
        accessGroupId: 1,
        name: 'updated-group',
      });

      expect(result).toEqual(mockGroup);
    });

    it('should delete access group', async () => {
      mockClient.deleteAccessGroup.mockResolvedValue({});

      const result = await handlers.handleToolCall('delete_access_group', {
        accessGroupId: 1,
      });

      expect(result).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown tool', async () => {
      await expect(
        handlers.handleToolCall('unknown_tool', {}),
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should handle LogicMonitorApiError', async () => {
      const apiError = new LogicMonitorApiError(
        'API Error',
        {
          status: 404,
          errorCode: 1404,
          errorMessage: 'Resource not found',
          errorDetail: 'Resource with ID 123 not found',
          path: '/api/v1/device/123',
          duration: 100,
        },
      );

      mockClient.getDevice.mockRejectedValue(apiError);

      await expect(
        handlers.handleToolCall('get_resource', { deviceId: 123 }),
      ).rejects.toThrow();
    });

    it('reports an invalid argument as INVALID_PARAMETERS without blaming credentials', async () => {
      const error: any = await handlers.handleToolCall('create_netscan', { name: 'n', method: 'nmap', collectorId: 1 }).catch(e => e);

      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe('INVALID_PARAMETERS');
      expect(error.message).toMatch(/subnet is required/);
      expect((error.suggestions ?? []).join(' ')).not.toMatch(/credentials|server logs|endpoint/i);
      expect(mockClient.createNetscan).not.toHaveBeenCalled();
    });

    describe('HTTP 403 handling', () => {
      const forbidden = (message: string) => new LogicMonitorApiError('API Error', {
        status: 403, errorCode: 1403, errorMessage: message, errorDetail: null, path: '/website/groups/1', duration: 5,
      });

      it('explains a state conflict with LogicMonitor\'s own message instead of blaming the token', async () => {
        mockClient.deleteWebsiteGroup.mockRejectedValue(forbidden('Please delete all websites and subfolers in this folder first.'));

        const error: any = await handlers.handleToolCall('delete_website_group', { groupId: 1 }).catch(e => e);

        expect(error).toBeInstanceOf(MCPError);
        expect(error.code).toBe('OPERATION_NOT_ALLOWED');
        const text = (error.suggestions ?? []).join(' ');
        expect(text).toContain('Please delete all websites and subfolers in this folder first.');
        expect(text).toMatch(/Move or delete what the object still contains/);
        expect(text).not.toMatch(/LM_BEARER_TOKEN/);
      });

      it('keeps the token and permission advice for genuine permission errors', async () => {
        mockClient.deleteWebsiteGroup.mockRejectedValue(forbidden('User does not have permission to delete this group'));

        const error: any = await handlers.handleToolCall('delete_website_group', { groupId: 1 }).catch(e => e);

        expect(error.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect((error.suggestions ?? []).join(' ')).toMatch(/LM_BEARER_TOKEN/);
      });

      it('treats a 403 with no message as a permission problem', async () => {
        mockClient.deleteWebsiteGroup.mockRejectedValue(forbidden(''));

        const error: any = await handlers.handleToolCall('delete_website_group', { groupId: 1 }).catch(e => e);

        expect(error.code).toBe('INSUFFICIENT_PERMISSIONS');
      });

      it('classifies messages', () => {
        expect(looksLikePermissionDenial('Forbidden')).toBe(true);
        expect(looksLikePermissionDenial('Insufficient privileges for this role')).toBe(true);
        expect(looksLikePermissionDenial('Access is denied')).toBe(true);
        expect(looksLikePermissionDenial('The token has expired')).toBe(true);
        expect(looksLikePermissionDenial('Please delete all websites and subfolers in this folder first.')).toBe(false);
        expect(looksLikePermissionDenial('The collector is in use')).toBe(false);
      });
    });

    it('should handle generic errors', async () => {
      const error = new Error('Generic error');
      mockClient.getDevice.mockRejectedValue(error);

      await expect(
        handlers.handleToolCall('get_resource', { deviceId: 123 }),
      ).rejects.toThrow('Generic error');
    });

    it('should handle non-Error objects', async () => {
      mockClient.getDevice.mockRejectedValue('string error');

      // Non-Error rejections are re-thrown as-is
      await expect(
        handlers.handleToolCall('get_resource', { deviceId: 123 }),
      ).rejects.toBe('string error');
    });
  });

  describe('formatResponse', () => {
    it('should format response as JSON', () => {
      const data = { id: 1, name: 'test' };
      const formatted = handlers.formatResponse(data);

      expect(formatted).toContain('"id": 1');
      expect(formatted).toContain('"name": "test"');
    });

    it('should format arrays', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const formatted = handlers.formatResponse(data);

      expect(formatted).toContain('[');
      expect(formatted).toContain(']');
    });

    it('should format nested objects', () => {
      const data = { user: { id: 1, profile: { name: 'test' } } };
      const formatted = handlers.formatResponse(data);

      expect(formatted).toContain('"user"');
      expect(formatted).toContain('"profile"');
    });
  });

  describe('Additional Tools', () => {
    it('should handle list_resource_datasources', async () => {
      const mockResponse = { items: [], total: 0 };
      mockClient.listDeviceDataSources.mockResolvedValue(mockResponse);

      await handlers.handleToolCall('list_resource_datasources', {
        deviceId: 1,
      });

      expect(mockClient.listDeviceDataSources).toHaveBeenCalledWith(1, {
        size: undefined,
        offset: undefined,
        filter: undefined,
        fields: undefined,
        autoPaginate: undefined,
      });
    });

    it('should handle get_resource_datasource', async () => {
      const mockDS = { id: 1, dataSourceId: 2 };
      mockClient.getDeviceDataSource.mockResolvedValue(mockDS);

      const result = await handlers.handleToolCall('get_resource_datasource', {
        deviceId: 1,
        deviceDataSourceId: 2,
      });

      expect(result).toEqual(mockDS);
    });

    it('should handle update_resource_datasource', async () => {
      mockClient.updateDeviceDataSource.mockResolvedValue({});

      await handlers.handleToolCall('update_resource_datasource', {
        deviceId: 1,
        deviceDataSourceId: 2,
        disableAlerting: true,
        stopMonitoring: false,
      });

      expect(mockClient.updateDeviceDataSource).toHaveBeenCalledWith(1, 2, {
        disableAlerting: true,
        stopMonitoring: false,
      });
    });

    it('should handle escalation chains', async () => {
      const mockChain = { id: 1, name: 'test-chain' };
      mockClient.listEscalationChains.mockResolvedValue({ items: [mockChain], total: 1 });
      mockClient.getEscalationChain.mockResolvedValue(mockChain);
      mockClient.createEscalationChain.mockResolvedValue(mockChain);
      mockClient.updateEscalationChain.mockResolvedValue(mockChain);
      mockClient.deleteEscalationChain.mockResolvedValue({});

      await handlers.handleToolCall('list_escalation_chains', {});
      await handlers.handleToolCall('get_escalation_chain', { chainId: 1 });
      await handlers.handleToolCall('create_escalation_chain', {
        name: 'new-chain',
        description: 'Test',
      });
      await handlers.handleToolCall('update_escalation_chain', {
        chainId: 1,
        name: 'updated',
      });
      await handlers.handleToolCall('delete_escalation_chain', { chainId: 1 });

      expect(mockClient.listEscalationChains).toHaveBeenCalled();
      expect(mockClient.getEscalationChain).toHaveBeenCalled();
      expect(mockClient.createEscalationChain).toHaveBeenCalled();
      expect(mockClient.updateEscalationChain).toHaveBeenCalled();
      expect(mockClient.deleteEscalationChain).toHaveBeenCalled();
    });

    it('should handle recipients and recipient groups', async () => {
      const mockRecipient = { id: 1, type: 'email', addr: 'test@example.com' };
      const mockGroup = { id: 1, name: 'test-group' };

      mockClient.createRecipient.mockResolvedValue(mockRecipient);
      mockClient.updateRecipient.mockResolvedValue(mockRecipient);
      mockClient.deleteRecipient.mockResolvedValue({});
      mockClient.createRecipientGroup.mockResolvedValue(mockGroup);
      mockClient.updateRecipientGroup.mockResolvedValue(mockGroup);
      mockClient.deleteRecipientGroup.mockResolvedValue({});

      await handlers.handleToolCall('create_recipient', {
        type: 'email',
        addr: 'test@example.com',
      });
      await handlers.handleToolCall('update_recipient', {
        recipientId: 1,
        addr: 'new@example.com',
      });
      await handlers.handleToolCall('delete_recipient', { recipientId: 1 });
      await handlers.handleToolCall('create_recipient_group', { name: 'test-group' });
      await handlers.handleToolCall('update_recipient_group', {
        groupId: 1,
        name: 'updated',
      });
      await handlers.handleToolCall('delete_recipient_group', { groupId: 1 });

      expect(mockClient.createRecipient).toHaveBeenCalled();
      expect(mockClient.updateRecipient).toHaveBeenCalled();
      expect(mockClient.deleteRecipient).toHaveBeenCalled();
      expect(mockClient.createRecipientGroup).toHaveBeenCalled();
      expect(mockClient.updateRecipientGroup).toHaveBeenCalled();
      expect(mockClient.deleteRecipientGroup).toHaveBeenCalled();
    });

    it('should handle alert rules', async () => {
      const mockRule = { id: 1, name: 'test-rule' };
      mockClient.createAlertRule.mockResolvedValue(mockRule);
      mockClient.updateAlertRule.mockResolvedValue(mockRule);
      mockClient.deleteAlertRule.mockResolvedValue({});

      await handlers.handleToolCall('create_alert_rule', {
        name: 'test-rule',
        escalationChainId: 1,
      });
      await handlers.handleToolCall('update_alert_rule', {
        ruleId: 1,
        name: 'updated',
      });
      await handlers.handleToolCall('delete_alert_rule', { ruleId: 1 });

      expect(mockClient.createAlertRule).toHaveBeenCalled();
      expect(mockClient.updateAlertRule).toHaveBeenCalled();
      expect(mockClient.deleteAlertRule).toHaveBeenCalled();
    });

    it('sends the escalation chain under the API field name escalatingChainId', async () => {
      mockClient.createAlertRule.mockResolvedValue({ id: 1 });
      mockClient.updateAlertRule.mockResolvedValue({ id: 1 });

      await handlers.handleToolCall('create_alert_rule', { name: 'r', priority: 5, escalationChainId: 7 });
      const created = mockClient.createAlertRule.mock.calls[0][0];
      expect(created.escalatingChainId).toBe(7);
      expect(created.escalationChainId).toBeUndefined();

      await handlers.handleToolCall('update_alert_rule', { ruleId: 1, escalationChainId: 9 });
      const [ruleId, updated] = mockClient.updateAlertRule.mock.calls[0];
      expect(ruleId).toBe(1);
      expect(updated.escalatingChainId).toBe(9);
      expect(updated.escalationChainId).toBeUndefined();
    });

    it('sends alert rule matching conditions as API fields', async () => {
      mockClient.createAlertRule.mockResolvedValue({ id: 1 });
      mockClient.updateAlertRule.mockResolvedValue({ id: 1 });

      await handlers.handleToolCall('create_alert_rule', {
        name: 'r', escalationChainId: 7, deviceGroups: ['Production*'], datasource: 'CPU*', datapoint: 'Busy*', severity: 'error',
      });
      expect(mockClient.createAlertRule.mock.calls[0][0]).toMatchObject({
        escalatingChainId: 7, deviceGroups: ['Production*'], datasource: 'CPU*', datapoint: 'Busy*', levelStr: 'Error',
      });

      await handlers.handleToolCall('update_alert_rule', { ruleId: 1, severity: 'critical' });
      expect(mockClient.updateAlertRule.mock.calls[0]).toEqual([1, { levelStr: 'Critical' }]);
    });

    it('turns deviceId, deviceGroupId and websiteId into opsnote scopes', async () => {
      mockClient.createOpsNote.mockResolvedValue({ id: 1 });
      mockClient.updateOpsNote.mockResolvedValue({ id: 1 });

      await handlers.handleToolCall('create_opsnote', { note: 'n', deviceId: 5, happenOnInSec: 1699889400, tags: ['deploy'] });
      expect(mockClient.createOpsNote.mock.calls[0][0]).toEqual({
        note: 'n', scopes: [{ type: 'device', deviceId: 5 }], happenOnInSec: 1699889400, tags: [{ name: 'deploy' }],
      });

      await handlers.handleToolCall('update_opsnote', { opsNoteId: 'abc', happenOnInSec: 1699889500 });
      expect(mockClient.updateOpsNote.mock.calls[0]).toEqual(['abc', { happenOnInSec: 1699889500 }]);
    });

    it('sends sharable and widgetTokens when creating a dashboard', async () => {
      mockClient.createDashboard.mockResolvedValue({ id: 1 });
      await handlers.handleToolCall('create_dashboard', { name: 'd', sharable: false, widgetTokens: [{ name: 'a', value: 'b' }] });
      expect(mockClient.createDashboard.mock.calls[0][0]).toEqual({
        name: 'd', sharable: false, widgetTokens: [{ name: 'a', value: 'b' }],
      });
    });

    it('should handle opsnotes', async () => {
      const mockNote = { id: 1, note: 'test note' };
      mockClient.createOpsNote.mockResolvedValue(mockNote);
      mockClient.updateOpsNote.mockResolvedValue(mockNote);
      mockClient.deleteOpsNote.mockResolvedValue({});

      await handlers.handleToolCall('create_opsnote', {
        note: 'test note',
        scopes: [],
      });
      await handlers.handleToolCall('update_opsnote', {
        opsNoteId: 1,
        note: 'updated',
      });
      await handlers.handleToolCall('delete_opsnote', { opsNoteId: 1 });

      expect(mockClient.createOpsNote).toHaveBeenCalled();
      expect(mockClient.updateOpsNote).toHaveBeenCalled();
      expect(mockClient.deleteOpsNote).toHaveBeenCalled();
    });

    describe('netscans', () => {
      beforeEach(() => {
        mockClient.createNetscan.mockResolvedValue({ id: 1 });
        mockClient.updateNetscan.mockResolvedValue({ id: 1 });
      });

      it('creates an nmap scan with the body LogicMonitor expects', async () => {
        await handlers.handleToolCall('create_netscan', {
          name: 'n', method: 'nmap', collectorId: 12, subnet: '10.0.1.0/24', defaultGroup: 5,
          schedule: { type: 'daily', cron: '00 02 * * *', timezone: 'America/New_York' },
        });

        expect(mockClient.createNetscan).toHaveBeenCalledWith({
          name: 'n', method: 'nmap', collector: 12, subnet: '10.0.1.0/24',
          schedule: { type: 'daily', cron: '00 02 * * *', timezone: 'America/New_York' },
          duplicate: { type: 1 }, ports: { isGlobalDefault: true, value: '' },
          ddr: { assignment: [{ group: 5, action: 'Include', disableAlerting: false, type: 1, query: '' }] },
        });
      });

      it('rejects an invalid scan before calling the API', async () => {
        await expect(handlers.handleToolCall('create_netscan', { name: 'n', method: 'nmap', collectorId: 1 })).rejects.toThrow(/subnet is required/);
        await expect(handlers.handleToolCall('create_netscan', { name: 'n', method: 'nmap', collectorId: 1, subnet: 's', schedule: { type: 'daily' } })).rejects.toThrow(/cron/);
        expect(mockClient.createNetscan).not.toHaveBeenCalled();
      });

      it('updates without looking the method up when only common fields change', async () => {
        await handlers.handleToolCall('update_netscan', { netscanId: 3, name: 'x', reason: 'why' });

        expect(mockClient.getNetscan).not.toHaveBeenCalled();
        expect(mockClient.updateNetscan).toHaveBeenCalledWith(3, { name: 'x' }, { reason: 'why' });
      });

      it('looks the method up when a method-specific setting changes', async () => {
        mockClient.getNetscan.mockResolvedValue({ method: 'script' });

        await handlers.handleToolCall('update_netscan', { netscanId: 3, groovyScript: 'x', defaultGroup: 2 });
        expect(mockClient.getNetscan).toHaveBeenCalledWith(3, { fields: 'method' });
        expect(mockClient.updateNetscan).toHaveBeenCalledWith(3, { groovyScript: 'x', defaultGroup: 2 }, undefined);

        await expect(handlers.handleToolCall('update_netscan', { netscanId: 3, subnet: 's' })).rejects.toThrow(/does not apply to a script scan/);
      });

      it('lists, creates, updates and deletes NetScan groups', async () => {
        mockClient.listNetscanGroups.mockResolvedValue({ total: 1, items: [{ id: 1, name: '@default' }] });
        mockClient.createNetscanGroup.mockResolvedValue({ id: 20 });
        mockClient.updateNetscanGroup.mockResolvedValue({ id: 20 });
        mockClient.deleteNetscanGroup.mockResolvedValue({});

        const listed = await handlers.handleToolCall('list_netscan_groups', {});
        expect(listed.items[0].name).toBe('@default');
        await handlers.handleToolCall('create_netscan_group', { name: 'g', description: 'd' });
        expect(mockClient.createNetscanGroup).toHaveBeenCalledWith({ name: 'g', description: 'd' });
        await handlers.handleToolCall('update_netscan_group', { groupId: 20, description: 'x' });
        expect(mockClient.updateNetscanGroup).toHaveBeenCalledWith(20, { description: 'x' });
        await handlers.handleToolCall('delete_netscan_group', { groupId: 20 });
        expect(mockClient.deleteNetscanGroup).toHaveBeenCalledWith(20);
      });
    });

    it('should handle netscans and integrations', async () => {
      const mockNetscan = { id: 1, name: 'test-netscan' };
      const mockIntegration = { id: 1, name: 'test-integration' };

      mockClient.createNetscan.mockResolvedValue(mockNetscan);
      mockClient.updateNetscan.mockResolvedValue(mockNetscan);
      mockClient.deleteNetscan.mockResolvedValue({});
      mockClient.createIntegration.mockResolvedValue(mockIntegration);
      mockClient.updateIntegration.mockResolvedValue(mockIntegration);
      mockClient.deleteIntegration.mockResolvedValue({});

      await handlers.handleToolCall('create_netscan', {
        name: 'test-netscan',
        method: 'script',
        collectorId: 1,
        scriptType: 'external',
        scriptPath: 'devices.csv',
      });
      await handlers.handleToolCall('update_netscan', {
        netscanId: 1,
        name: 'updated',
      });
      await handlers.handleToolCall('delete_netscan', { netscanId: 1 });
      await handlers.handleToolCall('create_integration', {
        name: 'test-integration',
        type: 'webhook',
      });
      await handlers.handleToolCall('update_integration', {
        integrationId: 1,
        name: 'updated',
      });
      await handlers.handleToolCall('delete_integration', { integrationId: 1 });

      expect(mockClient.createNetscan).toHaveBeenCalled();
      expect(mockClient.updateNetscan).toHaveBeenCalled();
      expect(mockClient.deleteNetscan).toHaveBeenCalled();
      expect(mockClient.createIntegration).toHaveBeenCalled();
      expect(mockClient.updateIntegration).toHaveBeenCalled();
      expect(mockClient.deleteIntegration).toHaveBeenCalled();
    });

    it('should handle topology and collector versions', async () => {
      const mockTopology = { nodes: [], links: [] };
      const mockVersions = { items: [{ version: '1.0.0' }], total: 1 };

      mockClient.getTopology.mockResolvedValue(mockTopology);
      mockClient.listCollectorVersions.mockResolvedValue(mockVersions);

      await handlers.handleToolCall('get_topology', {});
      await handlers.handleToolCall('list_collector_versions', {});

      expect(mockClient.getTopology).toHaveBeenCalled();
      expect(mockClient.listCollectorVersions).toHaveBeenCalled();
    });
  });

  describe('required argument validation', () => {
    it('rejects update_datasource without dataSourceId before calling the client', async () => {
      await expect(handlers.handleToolCall('update_datasource', {})).rejects.toThrow(
        /Missing required argument for update_datasource: dataSourceId/,
      );
      expect(mockClient.updateDataSource).not.toHaveBeenCalled();
    });

    it('rejects null, NaN and blank required values', async () => {
      await expect(handlers.handleToolCall('delete_datasource', { dataSourceId: null })).rejects.toThrow(MCPError);
      await expect(handlers.handleToolCall('delete_datasource', { dataSourceId: NaN })).rejects.toThrow(MCPError);
      await expect(handlers.handleToolCall('delete_datasource', { dataSourceId: ' ' })).rejects.toThrow(MCPError);
      expect(mockClient.deleteDataSource).not.toHaveBeenCalled();
    });

    it('allows the call when required arguments are present, including 0', async () => {
      mockClient.updateDataSource.mockResolvedValue({ id: 1 } as any);
      await handlers.handleToolCall('update_datasource', { dataSourceId: 1, description: 'x' });
      expect(mockClient.updateDataSource).toHaveBeenCalledWith(1, { description: 'x' });
    });
  });
});

