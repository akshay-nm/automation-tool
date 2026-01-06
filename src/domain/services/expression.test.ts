import { describe, it, expect, vi } from 'vitest';
import { resolveExpressions, evaluateTransform } from './expression.js';
import type { ExecutionContext } from '../entities/run.js';

// Mock nanoid for predictable UUID tests
vi.mock('nanoid', () => ({
  nanoid: () => 'test-uuid-12345',
}));

const createContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  trigger: {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { orderId: 'order-123', amount: 100, items: ['a', 'b'] },
    query: { format: 'json' },
    receivedAt: new Date(),
  },
  steps: {
    step1: { result: 'success', count: 42 },
    step2: { data: { nested: { value: 'deep' } } },
  },
  variables: {
    apiKey: 'secret-key',
  },
  ...overrides,
});

describe('resolveExpressions', () => {
  describe('primitive values', () => {
    it('should return numbers unchanged', async () => {
      const context = createContext();
      expect(await resolveExpressions(42, context)).toBe(42);
    });

    it('should return booleans unchanged', async () => {
      const context = createContext();
      expect(await resolveExpressions(true, context)).toBe(true);
      expect(await resolveExpressions(false, context)).toBe(false);
    });

    it('should return null unchanged', async () => {
      const context = createContext();
      expect(await resolveExpressions(null, context)).toBe(null);
    });

    it('should return undefined unchanged', async () => {
      const context = createContext();
      expect(await resolveExpressions(undefined, context)).toBe(undefined);
    });
  });

  describe('string templates', () => {
    it('should resolve trigger body properties', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.orderId}}', context);
      expect(result).toBe('order-123');
    });

    it('should resolve trigger headers', async () => {
      const context = createContext();
      // Use backticks for hyphenated keys in JSONata
      const result = await resolveExpressions('{{trigger.headers.`content-type`}}', context);
      expect(result).toBe('application/json');
    });

    it('should resolve trigger query params', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.query.format}}', context);
      expect(result).toBe('json');
    });

    it('should resolve step outputs', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{steps.step1.result}}', context);
      expect(result).toBe('success');
    });

    it('should resolve nested step data', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{steps.step2.data.nested.value}}', context);
      expect(result).toBe('deep');
    });

    it('should resolve variables', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{variables.apiKey}}', context);
      expect(result).toBe('secret-key');
    });

    it('should preserve number type for single expression', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.amount}}', context);
      expect(result).toBe(100);
      expect(typeof result).toBe('number');
    });

    it('should preserve array type for single expression', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.items}}', context);
      expect(result).toEqual(['a', 'b']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should preserve object type for single expression', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{steps.step2.data}}', context);
      expect(result).toEqual({ nested: { value: 'deep' } });
    });

    it('should interpolate multiple expressions in a string', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        'Order {{trigger.body.orderId}} with amount {{trigger.body.amount}}',
        context
      );
      expect(result).toBe('Order order-123 with amount 100');
    });

    it('should convert objects to JSON in interpolation', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        'Data: {{steps.step2.data}}',
        context
      );
      expect(result).toBe('Data: {"nested":{"value":"deep"}}');
    });

    it('should replace undefined with empty string in interpolation', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        'Value: {{trigger.body.missing}}',
        context
      );
      expect(result).toBe('Value: ');
    });

    it('should replace null with empty string in interpolation', async () => {
      const context = createContext({
        trigger: {
          method: 'POST',
          headers: {},
          body: { value: null },
          query: {},
          receivedAt: new Date(),
        },
        steps: {},
      });
      const result = await resolveExpressions('Value: {{trigger.body.value}}', context);
      expect(result).toBe('Value: ');
    });

    it('should return plain strings unchanged', async () => {
      const context = createContext();
      expect(await resolveExpressions('plain text', context)).toBe('plain text');
    });

    it('should handle malformed expressions gracefully', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{invalid expression syntax @@}}', context);
      // Should return the original template when JSONata fails
      expect(result).toBe('{{invalid expression syntax @@}}');
    });
  });

  describe('built-in functions', () => {
    it('should resolve $now() to ISO timestamp', async () => {
      const context = createContext();
      const before = new Date().toISOString().substring(0, 10);
      const result = await resolveExpressions('{{$now()}}', context) as string;
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.substring(0, 10)).toBe(before);
    });

    it('should resolve $uuid() to a unique ID', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{$uuid()}}', context);
      expect(result).toBe('test-uuid-12345');
    });

    it('should resolve $timestamp() to Unix milliseconds', async () => {
      const context = createContext();
      const before = Date.now();
      const result = await resolveExpressions('{{$timestamp()}}', context) as number;
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe('arrays', () => {
    it('should resolve expressions in array elements', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        ['{{trigger.body.orderId}}', '{{steps.step1.count}}', 'static'],
        context
      );
      expect(result).toEqual(['order-123', 42, 'static']);
    });

    it('should handle nested arrays', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        [['{{trigger.body.amount}}']],
        context
      );
      expect(result).toEqual([[100]]);
    });
  });

  describe('objects', () => {
    it('should resolve expressions in object values', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        {
          orderId: '{{trigger.body.orderId}}',
          count: '{{steps.step1.count}}',
          static: 'value',
        },
        context
      );
      expect(result).toEqual({
        orderId: 'order-123',
        count: 42,
        static: 'value',
      });
    });

    it('should handle deeply nested objects', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        {
          level1: {
            level2: {
              value: '{{trigger.body.orderId}}',
            },
          },
        },
        context
      );
      expect(result).toEqual({
        level1: {
          level2: {
            value: 'order-123',
          },
        },
      });
    });

    it('should handle mixed arrays and objects', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        {
          items: ['{{trigger.body.orderId}}', { nested: '{{steps.step1.result}}' }],
        },
        context
      );
      expect(result).toEqual({
        items: ['order-123', { nested: 'success' }],
      });
    });
  });

  describe('JSONata expressions', () => {
    it('should evaluate JSONata path expressions', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.amount}}', context);
      expect(result).toBe(100);
    });

    it('should evaluate JSONata with arithmetic', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.amount * 2}}', context);
      expect(result).toBe(200);
    });

    it('should evaluate JSONata array access', async () => {
      const context = createContext();
      const result = await resolveExpressions('{{trigger.body.items[0]}}', context);
      expect(result).toBe('a');
    });

    it('should evaluate JSONata string concatenation', async () => {
      const context = createContext();
      const result = await resolveExpressions(
        '{{trigger.body.orderId & "-suffix"}}',
        context
      );
      expect(result).toBe('order-123-suffix');
    });
  });
});

describe('evaluateTransform', () => {
  it('should evaluate JSONata expression', async () => {
    const context = createContext();
    const result = await evaluateTransform('trigger.body.orderId', context);
    expect(result).toBe('order-123');
  });

  it('should evaluate complex JSONata expression', async () => {
    const context = createContext();
    const result = await evaluateTransform('trigger.body.amount * 2', context);
    expect(result).toBe(200);
  });

  it('should access step outputs', async () => {
    const context = createContext();
    const result = await evaluateTransform('steps.step1.count', context);
    expect(result).toBe(42);
  });

  it('should access nested data', async () => {
    const context = createContext();
    const result = await evaluateTransform('steps.step2.data.nested.value', context);
    expect(result).toBe('deep');
  });

  it('should evaluate JSONata array operations', async () => {
    const context = createContext();
    const result = await evaluateTransform('$count(trigger.body.items)', context);
    expect(result).toBe(2);
  });

  it('should evaluate JSONata object construction', async () => {
    const context = createContext();
    const result = await evaluateTransform(
      '{"id": trigger.body.orderId, "total": trigger.body.amount}',
      context
    );
    expect(result).toEqual({ id: 'order-123', total: 100 });
  });

  it('should throw on invalid JSONata expression', async () => {
    const context = createContext();
    await expect(evaluateTransform('invalid @@@ syntax', context)).rejects.toThrow();
  });

  it('should return undefined for non-existent paths', async () => {
    const context = createContext();
    const result = await evaluateTransform('trigger.body.nonexistent', context);
    expect(result).toBeUndefined();
  });
});
