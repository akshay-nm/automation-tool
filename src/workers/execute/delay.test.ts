import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delayHandler } from './delay.js';
import type { Step } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';

describe('delayHandler', () => {
  const mockStep: Step = {
    id: 'step-1',
    workflowId: 'wf-1',
    order: 0,
    name: 'Delay Step',
    type: 'delay',
    config: {
      type: 'delay',
      durationMs: 5000,
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

  const mockContext: ExecutionContext = {
    trigger: {
      method: 'POST',
      headers: {},
      body: {},
      query: {},
      receivedAt: new Date('2024-01-15T10:00:00.000Z'),
    },
    steps: {},
    variables: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return delay duration in milliseconds', async () => {
    const result = await delayHandler.execute(
      mockStep,
      { durationMs: 5000 },
      mockContext
    );

    expect(result).toMatchObject({
      delayMs: 5000,
    });
  });

  it('should calculate delayedUntil timestamp', async () => {
    const result = await delayHandler.execute(
      mockStep,
      { durationMs: 5000 },
      mockContext
    );

    expect(result).toMatchObject({
      delayedUntil: '2024-01-15T10:00:05.000Z',
    });
  });

  it('should handle different delay durations', async () => {
    // 1 minute delay
    const result1 = await delayHandler.execute(
      mockStep,
      { durationMs: 60000 },
      mockContext
    );
    expect(result1).toMatchObject({
      delayMs: 60000,
      delayedUntil: '2024-01-15T10:01:00.000Z',
    });

    // 1 hour delay
    const result2 = await delayHandler.execute(
      mockStep,
      { durationMs: 3600000 },
      mockContext
    );
    expect(result2).toMatchObject({
      delayMs: 3600000,
      delayedUntil: '2024-01-15T11:00:00.000Z',
    });
  });

  it('should handle zero delay', async () => {
    const result = await delayHandler.execute(
      mockStep,
      { durationMs: 0 },
      mockContext
    );

    expect(result).toMatchObject({
      delayMs: 0,
      delayedUntil: '2024-01-15T10:00:00.000Z',
    });
  });

  it('should handle small delays', async () => {
    const result = await delayHandler.execute(
      mockStep,
      { durationMs: 100 },
      mockContext
    );

    expect(result).toMatchObject({
      delayMs: 100,
      delayedUntil: '2024-01-15T10:00:00.100Z',
    });
  });

  it('should handle large delays (24 hours)', async () => {
    const result = await delayHandler.execute(
      mockStep,
      { durationMs: 86400000 },
      mockContext
    );

    expect(result).toMatchObject({
      delayMs: 86400000,
      delayedUntil: '2024-01-16T10:00:00.000Z',
    });
  });

  it('should not actually block execution', async () => {
    // The delay handler should return immediately
    // The actual delay is handled by BullMQ at the queue level
    const startTime = Date.now();

    await delayHandler.execute(
      mockStep,
      { durationMs: 60000 },
      mockContext
    );

    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(100); // Should complete almost instantly
  });
});
