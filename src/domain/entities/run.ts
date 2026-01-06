import { z } from 'zod';

// Run status
export const RunStatus = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatus>;

// Step execution status
export const StepExecutionStatus = z.enum(['pending', 'running', 'completed', 'failed']);
export type StepExecutionStatus = z.infer<typeof StepExecutionStatus>;

// Trigger data from webhook
export const TriggerData = z.object({
  headers: z.record(z.string()),
  body: z.unknown(),
  query: z.record(z.string()),
  method: z.string(),
  receivedAt: z.date(),
  sourceIp: z.string().optional(),
});
export type TriggerData = z.infer<typeof TriggerData>;

// Execution context - accumulated state across steps
export const ExecutionContext = z.object({
  trigger: TriggerData,
  steps: z.record(z.unknown()).default({}),
  variables: z.record(z.unknown()).default({}),
});
export type ExecutionContext = z.infer<typeof ExecutionContext>;

// Run error
export const RunError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  stepId: z.string().optional(),
  stepName: z.string().optional(),
});
export type RunError = z.infer<typeof RunError>;

// Run entity
export const Run = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: RunStatus,
  triggerData: TriggerData,
  context: ExecutionContext,
  currentStepIndex: z.number().int().min(0),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  error: RunError.optional(),
});
export type Run = z.infer<typeof Run>;

// Step error
export const StepError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  retryable: z.boolean(),
});
export type StepError = z.infer<typeof StepError>;

// Step execution entity
export const StepExecution = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  stepName: z.string(),
  status: StepExecutionStatus,
  attempt: z.number().int().min(1),
  input: z.unknown(),
  output: z.unknown().optional(),
  error: StepError.optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationMs: z.number().int().optional(),
});
export type StepExecution = z.infer<typeof StepExecution>;
