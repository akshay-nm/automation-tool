import { describe, it, expect } from 'vitest';
import {
  StepType,
  RetryPolicy,
  HttpStepConfig,
  TransformStepConfig,
  AiStepConfig,
  DelayStepConfig,
  StepConfig,
  Step,
  Workflow,
  CreateWorkflowInput,
  CreateStepInput,
} from './workflow.js';

describe('StepType', () => {
  it('should accept valid step types', () => {
    expect(StepType.parse('http')).toBe('http');
    expect(StepType.parse('transform')).toBe('transform');
    expect(StepType.parse('ai')).toBe('ai');
    expect(StepType.parse('delay')).toBe('delay');
  });

  it('should reject invalid step types', () => {
    expect(() => StepType.parse('invalid')).toThrow();
    expect(() => StepType.parse('script')).toThrow();
    expect(() => StepType.parse('')).toThrow();
  });
});

describe('RetryPolicy', () => {
  it('should accept valid retry policy', () => {
    const policy = RetryPolicy.parse({
      maxAttempts: 5,
      backoffType: 'exponential',
      initialDelayMs: 2000,
      maxDelayMs: 120000,
    });

    expect(policy.maxAttempts).toBe(5);
    expect(policy.backoffType).toBe('exponential');
    expect(policy.initialDelayMs).toBe(2000);
    expect(policy.maxDelayMs).toBe(120000);
  });

  it('should apply defaults', () => {
    const policy = RetryPolicy.parse({});

    expect(policy.maxAttempts).toBe(3);
    expect(policy.backoffType).toBe('exponential');
    expect(policy.initialDelayMs).toBe(1000);
    expect(policy.maxDelayMs).toBe(60000);
  });

  it('should accept all backoff types', () => {
    expect(RetryPolicy.parse({ backoffType: 'fixed' }).backoffType).toBe('fixed');
    expect(RetryPolicy.parse({ backoffType: 'linear' }).backoffType).toBe('linear');
    expect(RetryPolicy.parse({ backoffType: 'exponential' }).backoffType).toBe('exponential');
  });

  it('should enforce maxAttempts bounds', () => {
    expect(() => RetryPolicy.parse({ maxAttempts: 0 })).toThrow();
    expect(() => RetryPolicy.parse({ maxAttempts: 11 })).toThrow();
    expect(RetryPolicy.parse({ maxAttempts: 1 }).maxAttempts).toBe(1);
    expect(RetryPolicy.parse({ maxAttempts: 10 }).maxAttempts).toBe(10);
  });

  it('should enforce initialDelayMs bounds', () => {
    expect(() => RetryPolicy.parse({ initialDelayMs: 50 })).toThrow();
    expect(() => RetryPolicy.parse({ initialDelayMs: 100000 })).toThrow();
    expect(RetryPolicy.parse({ initialDelayMs: 100 }).initialDelayMs).toBe(100);
    expect(RetryPolicy.parse({ initialDelayMs: 60000 }).initialDelayMs).toBe(60000);
  });

  it('should enforce maxDelayMs bounds', () => {
    expect(() => RetryPolicy.parse({ maxDelayMs: 500 })).toThrow();
    expect(() => RetryPolicy.parse({ maxDelayMs: 4000000 })).toThrow();
    expect(RetryPolicy.parse({ maxDelayMs: 1000 }).maxDelayMs).toBe(1000);
    expect(RetryPolicy.parse({ maxDelayMs: 3600000 }).maxDelayMs).toBe(3600000);
  });
});

describe('HttpStepConfig', () => {
  it('should accept valid HTTP config', () => {
    const config = HttpStepConfig.parse({
      type: 'http',
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { Authorization: 'Bearer token' },
      body: { key: 'value' },
      timeoutMs: 5000,
    });

    expect(config.type).toBe('http');
    expect(config.method).toBe('POST');
    expect(config.url).toBe('https://api.example.com/data');
    expect(config.headers).toEqual({ Authorization: 'Bearer token' });
    expect(config.body).toEqual({ key: 'value' });
    expect(config.timeoutMs).toBe(5000);
  });

  it('should accept all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    for (const method of methods) {
      const config = HttpStepConfig.parse({
        type: 'http',
        method,
        url: 'https://api.example.com',
      });
      expect(config.method).toBe(method);
    }
  });

  it('should require type and method and url', () => {
    expect(() => HttpStepConfig.parse({})).toThrow();
    expect(() => HttpStepConfig.parse({ type: 'http' })).toThrow();
    expect(() => HttpStepConfig.parse({ type: 'http', method: 'GET' })).toThrow();
  });

  it('should make headers, body, timeoutMs optional', () => {
    const config = HttpStepConfig.parse({
      type: 'http',
      method: 'GET',
      url: 'https://api.example.com',
    });

    expect(config.headers).toBeUndefined();
    expect(config.body).toBeUndefined();
    expect(config.timeoutMs).toBeUndefined();
  });
});

describe('TransformStepConfig', () => {
  it('should accept valid transform config', () => {
    const config = TransformStepConfig.parse({
      type: 'transform',
      expression: 'trigger.body.data',
      outputKey: 'result',
    });

    expect(config.type).toBe('transform');
    expect(config.expression).toBe('trigger.body.data');
    expect(config.outputKey).toBe('result');
  });

  it('should require all fields', () => {
    expect(() => TransformStepConfig.parse({ type: 'transform' })).toThrow();
    expect(() => TransformStepConfig.parse({ type: 'transform', expression: 'x' })).toThrow();
  });
});

describe('AiStepConfig', () => {
  it('should accept valid AI config', () => {
    const config = AiStepConfig.parse({
      type: 'ai',
      model: 'gpt-4',
      prompt: 'Summarize: {{trigger.body.text}}',
      systemPrompt: 'You are a helpful assistant.',
      maxTokens: 1000,
      temperature: 0.7,
      outputKey: 'summary',
    });

    expect(config.type).toBe('ai');
    expect(config.model).toBe('gpt-4');
    expect(config.prompt).toBe('Summarize: {{trigger.body.text}}');
    expect(config.systemPrompt).toBe('You are a helpful assistant.');
    expect(config.maxTokens).toBe(1000);
    expect(config.temperature).toBe(0.7);
    expect(config.outputKey).toBe('summary');
  });

  it('should apply default model', () => {
    const config = AiStepConfig.parse({
      type: 'ai',
      prompt: 'Test prompt',
      outputKey: 'result',
    });

    expect(config.model).toBe('default');
  });

  it('should make optional fields optional', () => {
    const config = AiStepConfig.parse({
      type: 'ai',
      prompt: 'Test',
      outputKey: 'result',
    });

    expect(config.systemPrompt).toBeUndefined();
    expect(config.maxTokens).toBeUndefined();
    expect(config.temperature).toBeUndefined();
  });

  it('should enforce temperature bounds', () => {
    expect(() =>
      AiStepConfig.parse({
        type: 'ai',
        prompt: 'Test',
        outputKey: 'result',
        temperature: -0.1,
      })
    ).toThrow();

    expect(() =>
      AiStepConfig.parse({
        type: 'ai',
        prompt: 'Test',
        outputKey: 'result',
        temperature: 2.1,
      })
    ).toThrow();

    expect(
      AiStepConfig.parse({
        type: 'ai',
        prompt: 'Test',
        outputKey: 'result',
        temperature: 0,
      }).temperature
    ).toBe(0);

    expect(
      AiStepConfig.parse({
        type: 'ai',
        prompt: 'Test',
        outputKey: 'result',
        temperature: 2,
      }).temperature
    ).toBe(2);
  });
});

describe('DelayStepConfig', () => {
  it('should accept valid delay config', () => {
    const config = DelayStepConfig.parse({
      type: 'delay',
      durationMs: 5000,
    });

    expect(config.type).toBe('delay');
    expect(config.durationMs).toBe(5000);
  });

  it('should require positive duration', () => {
    expect(() =>
      DelayStepConfig.parse({
        type: 'delay',
        durationMs: 0,
      })
    ).toThrow();

    expect(() =>
      DelayStepConfig.parse({
        type: 'delay',
        durationMs: -1000,
      })
    ).toThrow();
  });
});

describe('StepConfig (discriminated union)', () => {
  it('should discriminate by type field', () => {
    const http = StepConfig.parse({ type: 'http', method: 'GET', url: 'https://example.com' });
    expect(http.type).toBe('http');

    const transform = StepConfig.parse({
      type: 'transform',
      expression: 'x',
      outputKey: 'y',
    });
    expect(transform.type).toBe('transform');

    const ai = StepConfig.parse({ type: 'ai', prompt: 'x', outputKey: 'y' });
    expect(ai.type).toBe('ai');

    const delay = StepConfig.parse({ type: 'delay', durationMs: 1000 });
    expect(delay.type).toBe('delay');
  });

  it('should reject invalid type', () => {
    expect(() => StepConfig.parse({ type: 'invalid' })).toThrow();
  });
});

describe('Step', () => {
  it('should accept valid step', () => {
    const step = Step.parse({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      name: 'Fetch Data',
      type: 'http',
      config: { type: 'http', method: 'GET', url: 'https://api.example.com' },
      retryPolicy: { maxAttempts: 3 },
      timeoutMs: 30000,
      enabled: true,
    });

    expect(step.id).toBe('step-1');
    expect(step.order).toBe(0);
    expect(step.name).toBe('Fetch Data');
    expect(step.enabled).toBe(true);
  });

  it('should apply default enabled value', () => {
    const step = Step.parse({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      name: 'Test',
      type: 'http',
      config: { type: 'http', method: 'GET', url: 'https://example.com' },
    });

    expect(step.enabled).toBe(true);
  });

  it('should enforce name length', () => {
    expect(() =>
      Step.parse({
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        name: '',
        type: 'http',
        config: { type: 'http', method: 'GET', url: 'https://example.com' },
      })
    ).toThrow();

    expect(() =>
      Step.parse({
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        name: 'x'.repeat(101),
        type: 'http',
        config: { type: 'http', method: 'GET', url: 'https://example.com' },
      })
    ).toThrow();
  });

  it('should enforce order minimum', () => {
    expect(() =>
      Step.parse({
        id: 'step-1',
        workflowId: 'wf-1',
        order: -1,
        name: 'Test',
        type: 'http',
        config: { type: 'http', method: 'GET', url: 'https://example.com' },
      })
    ).toThrow();
  });
});

describe('Workflow', () => {
  it('should accept valid workflow', () => {
    const workflow = Workflow.parse({
      id: 'wf-1',
      name: 'My Workflow',
      slug: 'my-workflow',
      webhookSecret: 'secret123',
      enabled: true,
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(workflow.id).toBe('wf-1');
    expect(workflow.name).toBe('My Workflow');
    expect(workflow.slug).toBe('my-workflow');
    expect(workflow.webhookSecret).toBe('secret123');
  });

  it('should apply default values', () => {
    const workflow = Workflow.parse({
      id: 'wf-1',
      name: 'Test',
      slug: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(workflow.enabled).toBe(true);
    expect(workflow.steps).toEqual([]);
  });

  it('should validate slug format', () => {
    // Valid slugs
    expect(Workflow.parse({
      id: 'wf-1',
      name: 'Test',
      slug: 'my-workflow',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).slug).toBe('my-workflow');

    expect(Workflow.parse({
      id: 'wf-1',
      name: 'Test',
      slug: 'workflow123',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).slug).toBe('workflow123');

    // Invalid slugs
    expect(() =>
      Workflow.parse({
        id: 'wf-1',
        name: 'Test',
        slug: 'My Workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow();

    expect(() =>
      Workflow.parse({
        id: 'wf-1',
        name: 'Test',
        slug: 'my_workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow();
  });

  it('should enforce name length', () => {
    expect(() =>
      Workflow.parse({
        id: 'wf-1',
        name: '',
        slug: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow();

    expect(() =>
      Workflow.parse({
        id: 'wf-1',
        name: 'x'.repeat(201),
        slug: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow();
  });
});

describe('CreateWorkflowInput', () => {
  it('should accept valid input', () => {
    const input = CreateWorkflowInput.parse({
      name: 'My Workflow',
      slug: 'my-workflow',
    });

    expect(input.name).toBe('My Workflow');
    expect(input.slug).toBe('my-workflow');
    expect(input.enabled).toBe(true);
  });

  it('should apply defaults', () => {
    const input = CreateWorkflowInput.parse({
      name: 'Test',
      slug: 'test',
    });

    expect(input.enabled).toBe(true);
    expect(input.webhookSecret).toBeUndefined();
  });
});

describe('CreateStepInput', () => {
  it('should accept valid input', () => {
    const input = CreateStepInput.parse({
      name: 'Fetch Data',
      type: 'http',
      config: { type: 'http', method: 'GET', url: 'https://api.example.com' },
    });

    expect(input.name).toBe('Fetch Data');
    expect(input.type).toBe('http');
    expect(input.enabled).toBe(true);
  });

  it('should apply defaults', () => {
    const input = CreateStepInput.parse({
      name: 'Test',
      type: 'delay',
      config: { type: 'delay', durationMs: 1000 },
    });

    expect(input.enabled).toBe(true);
    expect(input.retryPolicy).toBeUndefined();
    expect(input.timeoutMs).toBeUndefined();
  });
});
