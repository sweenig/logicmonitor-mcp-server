/**
 * Tests for LogicMonitor MCP Server - Resources
 */

import { describe, it, expect } from '@jest/globals';
import { listLMResources, readLMResource } from './resources.js';

describe('LogicMonitor Resources', () => {
  describe('listLMResources', () => {
    it('should return a list of available resources', () => {
      const resources = listLMResources();

      expect(resources).toBeDefined();
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
    });

    it('should include the API swagger resource', () => {
      const resources = listLMResources();
      const swaggerResource = resources.find(r => r.uri === 'lm://api/swagger');

      expect(swaggerResource).toBeDefined();
      expect(swaggerResource?.name).toContain('API');
      expect(swaggerResource?.description).toBeTruthy();
      expect(swaggerResource?.mimeType).toBe('application/json');
    });

    it('should include the debug command reference resource', () => {
      const resources = listLMResources();
      const debugDocsResource = resources.find(r => r.uri === 'lm://docs/debug-commands');

      expect(debugDocsResource).toBeDefined();
      expect(debugDocsResource?.name).toContain('Debug');
      expect(debugDocsResource?.description).toBeTruthy();
      expect(debugDocsResource?.mimeType).toBe('text/markdown');
    });

    it('should include the collector script cache knowledge resource', () => {
      const resource = listLMResources().find(r => r.uri === 'lm://knowledge/collector-script-cache');

      expect(resource).toBeDefined();
      expect(resource?.description).toContain('ScriptCache');
      expect(resource?.mimeType).toBe('text/markdown');
    });

    it('should have valid resource structure', () => {
      const resources = listLMResources();

      resources.forEach(resource => {
        expect(resource.uri).toBeTruthy();
        expect(resource.name).toBeTruthy();
        expect(resource.description).toBeTruthy();
      });
    });
  });

  describe('readLMResource', () => {
    it('should read the collector script cache knowledge doc', async () => {
      const result = await readLMResource('lm://knowledge/collector-script-cache');

      expect(result.contents[0].uri).toBe('lm://knowledge/collector-script-cache');
      expect(result.contents[0].text).toContain('ScriptCache.getCache()');
    });

    it('should throw error for non-existent resource', async () => {
      await expect(
        readLMResource('lm://invalid/resource'),
      ).rejects.toThrow('Resource not found');
    });

    it('should fetch API swagger definition', async () => {
      const result = await readLMResource('lm://api/swagger');

      expect(result).toBeDefined();
      expect(result.contents).toBeDefined();
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents.length).toBe(1);

      const content = result.contents[0];
      expect(content.uri).toBe('lm://api/swagger');
      expect(content.mimeType).toBe('application/json');
      expect(content.text).toBeTruthy();

      // Verify it's valid JSON
      const swagger = JSON.parse(content.text);
      expect(swagger).toBeDefined();
      expect(swagger.swagger).toBeDefined();
      expect(swagger.paths).toBeDefined();
    }, 30000); // 30 second timeout for network request

    it('should return valid swagger structure', async () => {
      const result = await readLMResource('lm://api/swagger');
      const swagger = JSON.parse(result.contents[0].text);

      // Verify basic Swagger/OpenAPI structure
      expect(swagger.swagger || swagger.openapi).toBeDefined();
      expect(swagger.info).toBeDefined();
      expect(swagger.paths).toBeDefined();
      expect(typeof swagger.paths).toBe('object');

      // Verify LogicMonitor specific content
      expect(swagger.basePath).toBe('/santaba/rest');
      expect(swagger.schemes).toContain('https');
    }, 30000);

    it('should read the local debug command reference file', async () => {
      const result = await readLMResource('lm://docs/debug-commands');

      expect(result).toBeDefined();
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);

      const content = result.contents[0];
      expect(content.uri).toBe('lm://docs/debug-commands');
      expect(content.mimeType).toBe('text/markdown');
      expect(content.text).toContain('!groovy');
      expect(content.text).toContain('!posh');
    });
  });
});


describe('website knowledge resource', () => {
  it('is listed and explains types, locations and groups', async () => {
    const resource = listLMResources().find(r => r.uri === 'lm://knowledge/websites');
    expect(resource).toBeDefined();
    expect(resource!.mimeType).toBe('text/markdown');

    const content = await readLMResource('lm://knowledge/websites');
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    for (const term of ['webcheck', 'pingcheck', 'isInternal', 'collectorIds', 'smgIds', 'website group', 'create_website']) {
      expect(text).toContain(term);
    }
  });
});

describe('netscan knowledge resource', () => {
  it('is listed and explains the methods, schedules and groups', async () => {
    const resource = listLMResources().find(r => r.uri === 'lm://knowledge/netscans');
    expect(resource).toBeDefined();

    const content = await readLMResource('lm://knowledge/netscans');
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    for (const term of ['nmap', 'enhancedScript', 'embeded', 'cron', 'nsgId', 'create_netscan']) {
      expect(text).toContain(term);
    }
  });
});

describe('script datasource knowledge resource', () => {
  it('is listed and covers the build recipe', async () => {
    const resource = listLMResources().find(r => r.uri === 'lm://knowledge/script-datasource');
    expect(resource).toBeDefined();

    const content = await readLMResource('lm://knowledge/script-datasource');
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    for (const term of ['namevalue', '##WILDVALUE##', 'wildvalue##wildalias##description####', 'embeded', 'warning', 'verticalLabel', 'test_datasource', '__NUXT__']) {
      expect(text).toContain(term);
    }
  });
});
