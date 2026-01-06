import { z } from 'zod';

// Step Types
export const StepType = z.enum(['http', 'transform', 'ai', 'delay']);
export type StepType = z.infer<typeof StepType>;

// Retry Policy
export const RetryPolicy = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  backoffType: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
  initialDelayMs: z.number().int().min(100).max(60000).default(1000),
  maxDelayMs: z.number().int().min(1000).max(3600000).default(60000),
});
export type RetryPolicy = z.infer<typeof RetryPolicy>;

// HTTP Step Config
export const HttpStepConfig = z.object({
  type: z.literal('http'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type HttpStepConfig = z.infer<typeof HttpStepConfig>;

// Transform Step Config
export const TransformStepConfig = z.object({
  type: z.literal('transform'),
  expression: z.string(),
  outputKey: z.string(),
});
export type TransformStepConfig = z.infer<typeof TransformStepConfig>;

// AI Step Config
export const AiStepConfig = z.object({
  type: z.literal('ai'),
  model: z.string().default('default'),
  prompt: z.string(),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  outputKey: z.string(),
});
export type AiStepConfig = z.infer<typeof AiStepConfig>;

// Delay Step Config
export const DelayStepConfig = z.object({
  type: z.literal('delay'),
  durationMs: z.number().int().positive(),
});
export type DelayStepConfig = z.infer<typeof DelayStepConfig>;

// Union of all step configs
export const StepConfig = z.discriminatedUnion('type', [
  HttpStepConfig,
  TransformStepConfig,
  AiStepConfig,
  DelayStepConfig,
]);
export type StepConfig = z.infer<typeof StepConfig>;

// Step entity
export const Step = z.object({
  id: z.string(),
  workflowId: z.string(),
  order: z.number().int().min(0),
  name: z.string().min(1).max(100),
  type: StepType,
  config: StepConfig,
  retryPolicy: RetryPolicy.optional(),
  timeoutMs: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
});
export type Step = z.infer<typeof Step>;

// Workflow entity
export const Workflow = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().default(true),
  steps: z.array(Step).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Workflow = z.infer<typeof Workflow>;

// Create workflow input
export const CreateWorkflowInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowInput>;

// Create step input
export const CreateStepInput = z.object({
  name: z.string().min(1).max(100),
  type: StepType,
  config: StepConfig,
  retryPolicy: RetryPolicy.optional(),
  timeoutMs: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
});
export type CreateStepInput = z.infer<typeof CreateStepInput>;
