import { describe, it, expect } from 'vitest';
import { transformHandler } from './transform.js';
import { WorkflowError, ErrorCategory } from '../../domain/errors.js';
import type { Step } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';

describe('transformHandler', () => {
  const mockStep: Step = {
    id: 'step-1',
    workflowId: 'wf-1',
    order: 0,
    name: 'Transform Step',
    type: 'transform',
    config: {
      type: 'transform',
      expression: 'trigger.body',
      outputKey: 'result',
    },
    retryPolicy: {
      maxAttempts: 1,
      backoffType: 'fixed',
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    timeoutMs: 30000,
    enabled: true,
  };

  const createContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
    trigger: {
      method: 'POST',
      headers: {},
      body: {
        orderId: 'order-123',
        amount: 100,
        items: [
          { name: 'Item 1', price: 30 },
          { name: 'Item 2', price: 70 },
        ],
      },
      query: {},
      receivedAt: new Date(),
    },
    steps: {
      fetch: {
        status: 200,
        body: { data: { value: 42 } },
      },
    },
    variables: {},
    ...overrides,
  });

  describe('successful transformations', () => {
    it('should extract simple value and wrap in outputKey', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.orderId', outputKey: 'extractedId' },
        context
      );

      expect(result).toEqual({ extractedId: 'order-123' });
    });

    it('should extract numeric value', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.amount', outputKey: 'total' },
        context
      );

      expect(result).toEqual({ total: 100 });
    });

    it('should extract array', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.items', outputKey: 'itemList' },
        context
      );

      expect(result).toEqual({
        itemList: [
          { name: 'Item 1', price: 30 },
          { name: 'Item 2', price: 70 },
        ],
      });
    });

    it('should extract from previous step output', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'steps.fetch.body.data.value', outputKey: 'result' },
        context
      );

      expect(result).toEqual({ result: 42 });
    });

    it('should perform arithmetic operations', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.amount * 2', outputKey: 'doubled' },
        context
      );

      expect(result).toEqual({ doubled: 200 });
    });

    it('should map over arrays', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.items.name', outputKey: 'names' },
        context
      ) as { names: string[] };

      // JSONata adds a `sequence: true` property to mapped arrays, so we compare values
      expect(Array.isArray(result.names)).toBe(true);
      expect([...result.names]).toEqual(['Item 1', 'Item 2']);
    });

    it('should sum array values', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: '$sum(trigger.body.items.price)', outputKey: 'totalPrice' },
        context
      );

      expect(result).toEqual({ totalPrice: 100 });
    });

    it('should count array elements', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: '$count(trigger.body.items)', outputKey: 'count' },
        context
      );

      expect(result).toEqual({ count: 2 });
    });

    it('should construct new objects', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        {
          expression: '{"id": trigger.body.orderId, "total": trigger.body.amount}',
          outputKey: 'order',
        },
        context
      );

      expect(result).toEqual({
        order: { id: 'order-123', total: 100 },
      });
    });

    it('should handle string concatenation', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: '"Order: " & trigger.body.orderId', outputKey: 'message' },
        context
      );

      expect(result).toEqual({ message: 'Order: order-123' });
    });

    it('should filter arrays', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.items[price > 50]', outputKey: 'expensive' },
        context
      );

      expect(result).toEqual({
        expensive: { name: 'Item 2', price: 70 },
      });
    });

    it('should handle undefined for non-existent paths', async () => {
      const context = createContext();
      const result = await transformHandler.execute(
        mockStep,
        { expression: 'trigger.body.missing', outputKey: 'value' },
        context
      );

      expect(result).toEqual({ value: undefined });
    });
  });

  describe('error handling', () => {
    it('should throw VALIDATION error for invalid expression', async () => {
      const context = createContext();

      const promise = transformHandler.execute(
        mockStep,
        { expression: 'invalid @@@ syntax', outputKey: 'result' },
        context
      );

      await expect(promise).rejects.toThrow(WorkflowError);
      await expect(promise).rejects.toMatchObject({
        code: 'TRANSFORM_ERROR',
        category: ErrorCategory.VALIDATION,
      });
    });

    it('should include expression in error details', async () => {
      const context = createContext();

      try {
        await transformHandler.execute(
          mockStep,
          { expression: 'broken @@ syntax', outputKey: 'result' },
          context
        );
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).details).toMatchObject({
          expression: 'broken @@ syntax',
        });
      }
    });

    it('should throw error for incomplete JSONata expression', async () => {
      const context = createContext();

      const promise = transformHandler.execute(
        mockStep,
        { expression: '(unclosed', outputKey: 'result' },
        context
      );

      await expect(promise).rejects.toThrow(WorkflowError);
    });
  });
});
