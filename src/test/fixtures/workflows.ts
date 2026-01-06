import type { Workflow, Step, HttpStepConfig, TransformStepConfig, AiStepConfig, DelayStepConfig } from '../../domain/entities/workflow.js';

export function createWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-test-001',
    name: 'Test Workflow',
    slug: 'test-workflow',
    enabled: true,
    steps: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function createHttpStep(overrides: Partial<Step> = {}, configOverrides: Partial<Omit<HttpStepConfig, 'type'>> = {}): Step {
  return {
    id: 'step-http-001',
    workflowId: 'wf-test-001',
    order: 0,
    name: 'HTTP Request',
    type: 'http',
    config: {
      type: 'http',
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {},
      ...configOverrides,
    },
    retryPolicy: {
      maxAttempts: 3,
      backoffType: 'exponential',
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    timeoutMs: 30000,
    enabled: true,
    ...overrides,
  };
}

export function createTransformStep(overrides: Partial<Step> = {}, configOverrides: Partial<Omit<TransformStepConfig, 'type'>> = {}): Step {
  return {
    id: 'step-transform-001',
    workflowId: 'wf-test-001',
    order: 1,
    name: 'Transform Data',
    type: 'transform',
    config: {
      type: 'transform',
      expression: '$.data',
      outputKey: 'transformed',
      ...configOverrides,
    },
    retryPolicy: {
      maxAttempts: 1,
      backoffType: 'fixed',
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    timeoutMs: 30000,
    enabled: true,
    ...overrides,
  };
}

export function createAiStep(overrides: Partial<Step> = {}, configOverrides: Partial<Omit<AiStepConfig, 'type'>> = {}): Step {
  return {
    id: 'step-ai-001',
    workflowId: 'wf-test-001',
    order: 2,
    name: 'AI Processing',
    type: 'ai',
    config: {
      type: 'ai',
      model: 'local-model',
      prompt: 'Summarize: {{steps.transform.output}}',
      outputKey: 'summary',
      ...configOverrides,
    },
    retryPolicy: {
      maxAttempts: 2,
      backoffType: 'exponential',
      initialDelayMs: 2000,
      maxDelayMs: 120000,
    },
    timeoutMs: 300000,
    enabled: true,
    ...overrides,
  };
}

export function createDelayStep(overrides: Partial<Step> = {}, configOverrides: Partial<Omit<DelayStepConfig, 'type'>> = {}): Step {
  return {
    id: 'step-delay-001',
    workflowId: 'wf-test-001',
    order: 3,
    name: 'Wait',
    type: 'delay',
    config: {
      type: 'delay',
      durationMs: 5000,
      ...configOverrides,
    },
    retryPolicy: {
      maxAttempts: 1,
      backoffType: 'fixed',
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    timeoutMs: 30000,
    enabled: true,
    ...overrides,
  };
}

export function createFullWorkflow(): Workflow {
  return createWorkflow({
    steps: [
      createHttpStep({ order: 0 }),
      createTransformStep({ order: 1 }),
      createDelayStep({ order: 2 }),
    ],
  });
}
