import type { Run, StepExecution, TriggerData, ExecutionContext } from '../../domain/entities/run.js';

export function createTriggerData(overrides: Partial<TriggerData> = {}): TriggerData {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-123',
    },
    body: {
      orderId: 'order-456',
      amount: 100,
    },
    query: {},
    receivedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    trigger: createTriggerData(),
    steps: {},
    variables: {},
    ...overrides,
  };
}

export function createRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-test-001',
    workflowId: 'wf-test-001',
    status: 'pending',
    triggerData: createTriggerData(),
    context: createExecutionContext(),
    currentStepIndex: 0,
    startedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createRunningRun(overrides: Partial<Run> = {}): Run {
  return createRun({
    status: 'running',
    ...overrides,
  });
}

export function createCompletedRun(overrides: Partial<Run> = {}): Run {
  return createRun({
    status: 'completed',
    completedAt: new Date('2024-01-01T00:01:00Z'),
    context: createExecutionContext({
      steps: {
        'HTTP Request': {
          status: 200,
          body: { result: 'success' },
        },
      },
    }),
    ...overrides,
  });
}

export function createFailedRun(overrides: Partial<Run> = {}): Run {
  return createRun({
    status: 'failed',
    completedAt: new Date('2024-01-01T00:01:00Z'),
    error: {
      code: 'HTTP_ERROR',
      message: 'Request failed with status 500',
    },
    ...overrides,
  });
}

export function createStepExecution(overrides: Partial<StepExecution> = {}): StepExecution {
  return {
    id: 'exec-test-001',
    runId: 'run-test-001',
    stepId: 'step-http-001',
    stepName: 'HTTP Request',
    status: 'pending',
    attempt: 1,
    input: {
      method: 'GET',
      url: 'https://api.example.com/data',
    },
    startedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createCompletedStepExecution(overrides: Partial<StepExecution> = {}): StepExecution {
  return createStepExecution({
    status: 'completed',
    output: {
      status: 200,
      body: { result: 'success' },
    },
    durationMs: 150,
    ...overrides,
  });
}

export function createFailedStepExecution(overrides: Partial<StepExecution> = {}): StepExecution {
  return createStepExecution({
    status: 'failed',
    error: {
      code: 'HTTP_ERROR',
      message: 'Request failed',
      retryable: true,
    },
    durationMs: 100,
    ...overrides,
  });
}
