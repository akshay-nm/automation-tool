import { describe, it, expect } from 'vitest';
import {
  RunStatus,
  StepExecutionStatus,
  TriggerData,
  ExecutionContext,
  RunError,
  Run,
  StepError,
  StepExecution,
} from './run.js';

describe('RunStatus', () => {
  it('should accept valid run statuses', () => {
    expect(RunStatus.parse('pending')).toBe('pending');
    expect(RunStatus.parse('running')).toBe('running');
    expect(RunStatus.parse('completed')).toBe('completed');
    expect(RunStatus.parse('failed')).toBe('failed');
    expect(RunStatus.parse('cancelled')).toBe('cancelled');
  });

  it('should reject invalid status', () => {
    expect(() => RunStatus.parse('invalid')).toThrow();
    expect(() => RunStatus.parse('')).toThrow();
    expect(() => RunStatus.parse('PENDING')).toThrow();
  });
});

describe('StepExecutionStatus', () => {
  it('should accept valid step execution statuses', () => {
    expect(StepExecutionStatus.parse('pending')).toBe('pending');
    expect(StepExecutionStatus.parse('running')).toBe('running');
    expect(StepExecutionStatus.parse('completed')).toBe('completed');
    expect(StepExecutionStatus.parse('failed')).toBe('failed');
  });

  it('should reject invalid status', () => {
    expect(() => StepExecutionStatus.parse('cancelled')).toThrow();
    expect(() => StepExecutionStatus.parse('invalid')).toThrow();
  });
});

describe('TriggerData', () => {
  it('should accept valid trigger data', () => {
    const trigger = TriggerData.parse({
      headers: { 'content-type': 'application/json' },
      body: { orderId: '123' },
      query: { format: 'json' },
      method: 'POST',
      receivedAt: new Date(),
      sourceIp: '127.0.0.1',
    });

    expect(trigger.headers).toEqual({ 'content-type': 'application/json' });
    expect(trigger.body).toEqual({ orderId: '123' });
    expect(trigger.query).toEqual({ format: 'json' });
    expect(trigger.method).toBe('POST');
    expect(trigger.sourceIp).toBe('127.0.0.1');
  });

  it('should require headers, body, query, method, receivedAt', () => {
    expect(() => TriggerData.parse({})).toThrow();
    expect(() => TriggerData.parse({ headers: {} })).toThrow();
    expect(() =>
      TriggerData.parse({
        headers: {},
        body: {},
        query: {},
        method: 'GET',
      })
    ).toThrow();
  });

  it('should make sourceIp optional', () => {
    const trigger = TriggerData.parse({
      headers: {},
      body: null,
      query: {},
      method: 'GET',
      receivedAt: new Date(),
    });

    expect(trigger.sourceIp).toBeUndefined();
  });

  it('should accept any body type', () => {
    expect(
      TriggerData.parse({
        headers: {},
        body: null,
        query: {},
        method: 'GET',
        receivedAt: new Date(),
      }).body
    ).toBeNull();

    expect(
      TriggerData.parse({
        headers: {},
        body: 'string body',
        query: {},
        method: 'GET',
        receivedAt: new Date(),
      }).body
    ).toBe('string body');

    expect(
      TriggerData.parse({
        headers: {},
        body: [1, 2, 3],
        query: {},
        method: 'GET',
        receivedAt: new Date(),
      }).body
    ).toEqual([1, 2, 3]);
  });
});

describe('ExecutionContext', () => {
  it('should accept valid execution context', () => {
    const context = ExecutionContext.parse({
      trigger: {
        headers: {},
        body: {},
        query: {},
        method: 'GET',
        receivedAt: new Date(),
      },
      steps: {
        step1: { result: 'success' },
      },
      variables: {
        apiKey: 'secret',
      },
    });

    expect(context.steps.step1).toEqual({ result: 'success' });
    expect(context.variables?.apiKey).toBe('secret');
  });

  it('should apply default values for steps and variables', () => {
    const context = ExecutionContext.parse({
      trigger: {
        headers: {},
        body: {},
        query: {},
        method: 'GET',
        receivedAt: new Date(),
      },
    });

    expect(context.steps).toEqual({});
    expect(context.variables).toEqual({});
  });
});

describe('RunError', () => {
  it('should accept valid run error', () => {
    const error = RunError.parse({
      code: 'HTTP_500',
      message: 'Internal server error',
      details: { status: 500 },
      stepId: 'step-1',
      stepName: 'Fetch Data',
    });

    expect(error.code).toBe('HTTP_500');
    expect(error.message).toBe('Internal server error');
    expect(error.details).toEqual({ status: 500 });
    expect(error.stepId).toBe('step-1');
    expect(error.stepName).toBe('Fetch Data');
  });

  it('should require code and message', () => {
    expect(() => RunError.parse({})).toThrow();
    expect(() => RunError.parse({ code: 'ERROR' })).toThrow();
  });

  it('should make details, stepId, stepName optional', () => {
    const error = RunError.parse({
      code: 'ERROR',
      message: 'Something went wrong',
    });

    expect(error.details).toBeUndefined();
    expect(error.stepId).toBeUndefined();
    expect(error.stepName).toBeUndefined();
  });
});

describe('Run', () => {
  const validTrigger = {
    headers: {},
    body: {},
    query: {},
    method: 'GET',
    receivedAt: new Date(),
  };

  it('should accept valid run', () => {
    const run = Run.parse({
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'running',
      triggerData: validTrigger,
      context: { trigger: validTrigger },
      currentStepIndex: 2,
      startedAt: new Date(),
    });

    expect(run.id).toBe('run-1');
    expect(run.workflowId).toBe('wf-1');
    expect(run.status).toBe('running');
    expect(run.currentStepIndex).toBe(2);
  });

  it('should accept completed run', () => {
    const run = Run.parse({
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'completed',
      triggerData: validTrigger,
      context: { trigger: validTrigger },
      currentStepIndex: 3,
      startedAt: new Date('2024-01-01T00:00:00Z'),
      completedAt: new Date('2024-01-01T00:01:00Z'),
    });

    expect(run.completedAt).toBeInstanceOf(Date);
  });

  it('should accept failed run with error', () => {
    const run = Run.parse({
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'failed',
      triggerData: validTrigger,
      context: { trigger: validTrigger },
      currentStepIndex: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      error: {
        code: 'HTTP_500',
        message: 'Server error',
        stepId: 'step-1',
      },
    });

    expect(run.error?.code).toBe('HTTP_500');
  });

  it('should enforce currentStepIndex minimum', () => {
    expect(() =>
      Run.parse({
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'running',
        triggerData: validTrigger,
        context: { trigger: validTrigger },
        currentStepIndex: -1,
        startedAt: new Date(),
      })
    ).toThrow();
  });

  it('should make completedAt and error optional', () => {
    const run = Run.parse({
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'pending',
      triggerData: validTrigger,
      context: { trigger: validTrigger },
      currentStepIndex: 0,
      startedAt: new Date(),
    });

    expect(run.completedAt).toBeUndefined();
    expect(run.error).toBeUndefined();
  });
});

describe('StepError', () => {
  it('should accept valid step error', () => {
    const error = StepError.parse({
      code: 'TIMEOUT',
      message: 'Request timed out',
      details: { timeoutMs: 30000 },
      retryable: true,
    });

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('Request timed out');
    expect(error.details).toEqual({ timeoutMs: 30000 });
    expect(error.retryable).toBe(true);
  });

  it('should require code, message, and retryable', () => {
    expect(() => StepError.parse({})).toThrow();
    expect(() => StepError.parse({ code: 'ERROR' })).toThrow();
    expect(() => StepError.parse({ code: 'ERROR', message: 'Error' })).toThrow();
  });

  it('should make details optional', () => {
    const error = StepError.parse({
      code: 'ERROR',
      message: 'Something failed',
      retryable: false,
    });

    expect(error.details).toBeUndefined();
  });
});

describe('StepExecution', () => {
  it('should accept valid step execution', () => {
    const exec = StepExecution.parse({
      id: 'exec-1',
      runId: 'run-1',
      stepId: 'step-1',
      stepName: 'Fetch Data',
      status: 'completed',
      attempt: 1,
      input: { url: 'https://api.example.com' },
      output: { status: 200, body: { data: 'result' } },
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 150,
    });

    expect(exec.id).toBe('exec-1');
    expect(exec.status).toBe('completed');
    expect(exec.attempt).toBe(1);
    expect(exec.output).toEqual({ status: 200, body: { data: 'result' } });
  });

  it('should accept failed step execution', () => {
    const exec = StepExecution.parse({
      id: 'exec-1',
      runId: 'run-1',
      stepId: 'step-1',
      stepName: 'Fetch Data',
      status: 'failed',
      attempt: 2,
      input: {},
      error: {
        code: 'HTTP_500',
        message: 'Server error',
        retryable: true,
      },
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 100,
    });

    expect(exec.error?.code).toBe('HTTP_500');
    expect(exec.error?.retryable).toBe(true);
  });

  it('should enforce attempt minimum', () => {
    expect(() =>
      StepExecution.parse({
        id: 'exec-1',
        runId: 'run-1',
        stepId: 'step-1',
        stepName: 'Test',
        status: 'pending',
        attempt: 0,
        input: {},
        startedAt: new Date(),
      })
    ).toThrow();
  });

  it('should make output, error, completedAt, durationMs optional', () => {
    const exec = StepExecution.parse({
      id: 'exec-1',
      runId: 'run-1',
      stepId: 'step-1',
      stepName: 'Test',
      status: 'running',
      attempt: 1,
      input: {},
      startedAt: new Date(),
    });

    expect(exec.output).toBeUndefined();
    expect(exec.error).toBeUndefined();
    expect(exec.completedAt).toBeUndefined();
    expect(exec.durationMs).toBeUndefined();
  });

  it('should accept any input type', () => {
    const exec = StepExecution.parse({
      id: 'exec-1',
      runId: 'run-1',
      stepId: 'step-1',
      stepName: 'Test',
      status: 'pending',
      attempt: 1,
      input: null,
      startedAt: new Date(),
    });

    expect(exec.input).toBeNull();
  });
});
