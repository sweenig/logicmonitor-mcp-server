/**
 * Tests for LogicMonitor MCP Server - Prompts
 */

import { describe, it, expect } from '@jest/globals';
import { listLMPrompts, getLMPrompt, generatePromptMessages } from './prompts.js';

describe('LogicMonitor Prompts', () => {
  describe('listLMPrompts', () => {
    it('should return a list of available prompts', () => {
      const prompts = listLMPrompts();

      expect(prompts).toBeDefined();
      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should include the resource_check prompt', () => {
      const prompts = listLMPrompts();
      const healthPrompt = prompts.find(p => p.name === 'resource_check');

      expect(healthPrompt).toBeDefined();
      expect(healthPrompt?.name).toBe('resource_check');
      expect(healthPrompt?.description).toBeTruthy();
      expect(healthPrompt?.arguments).toBeDefined();
      expect(Array.isArray(healthPrompt?.arguments)).toBe(true);
    });

    it('should have valid prompt structure', () => {
      const prompts = listLMPrompts();

      prompts.forEach(prompt => {
        expect(prompt.name).toBeTruthy();
        expect(prompt.description).toBeTruthy();
        expect(typeof prompt.name).toBe('string');
        expect(typeof prompt.description).toBe('string');
      });
    });

    it('should have valid arguments structure for resource_check', () => {
      const prompts = listLMPrompts();
      const healthPrompt = prompts.find(p => p.name === 'resource_check');

      expect(healthPrompt?.arguments).toBeDefined();
      expect(healthPrompt?.arguments?.length).toBeGreaterThan(0);

      healthPrompt?.arguments?.forEach(arg => {
        expect(arg.name).toBeTruthy();
        expect(arg.description).toBeTruthy();
        expect(typeof arg.name).toBe('string');
        expect(typeof arg.description).toBe('string');
      });
    });
  });

  describe('getLMPrompt', () => {
    it('should return prompt by name', () => {
      const prompt = getLMPrompt('resource_check');

      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe('resource_check');
    });

    it('should return undefined for non-existent prompt', () => {
      const prompt = getLMPrompt('non_existent_prompt');

      expect(prompt).toBeUndefined();
    });

    it('should return prompt with all properties', () => {
      const prompt = getLMPrompt('resource_check');

      expect(prompt).toBeDefined();
      expect(prompt?.name).toBeTruthy();
      expect(prompt?.description).toBeTruthy();
      expect(prompt?.arguments).toBeDefined();
    });
  });

  describe('datasource_from_mib', () => {
    it('is listed with a required table argument and optional others', () => {
      const prompt = getLMPrompt('datasource_from_mib');

      expect(prompt).toBeDefined();
      const required = prompt?.arguments?.filter(a => a.required).map(a => a.name);
      expect(required).toEqual(['table']);
      const names = prompt?.arguments?.map(a => a.name);
      expect(names).toEqual(['table', 'mibText', 'existingDataSource', 'testResource']);
    });

    it('requires the table argument', () => {
      expect(() => generatePromptMessages('datasource_from_mib', {})).toThrow('Missing required argument: table');
    });

    it('points at the knowledge resource and asks for the MIB text when none is given', () => {
      const result = generatePromptMessages('datasource_from_mib', { table: 'rPDUOutletStatusTable' });
      const text = result.messages[0].content.text;

      expect(result.messages).toHaveLength(1);
      expect(text).toContain('rPDUOutletStatusTable');
      expect(text).toContain('lm://knowledge/snmp-datasource-from-mib');
      expect(text).toContain('not the whole file');
      expect(text).toContain('false()');
    });

    it('includes the pasted MIB text, the existing DataSource and the test resource', () => {
      const result = generatePromptMessages('datasource_from_mib', {
        table: 'rPDUOutletStatusTable',
        mibText: 'rPDUOutletStatusTable OBJECT-TYPE ...',
        existingDataSource: 'APC Rack PDU Outlet Status-',
        testResource: 'pdu-01',
      });
      const text = result.messages[0].content.text;

      expect(text).toContain('rPDUOutletStatusTable OBJECT-TYPE ...');
      expect(text).toContain('Improve the existing DataSource "APC Rack PDU Outlet Status-"');
      expect(text).toContain('"pdu-01"');
      expect(text).not.toContain('I have not pasted the MIB text yet');
    });
  });
});
