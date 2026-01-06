import { type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { resolveExpressions } from '../domain/services/expression.js';
import { classifyError, calculateBackoff } from '../domain/errors.js';
import type { ExecuteStepMessage, QueueMessage } from '../queue/messages.js';
import type { Step } from '../domain/entities/workflow.js';
import type { ExecutionContext } from '../domain/entities/run.js';
import type { WorkflowRepository } from '../storage/repositories/workflow.js';
import type { RunRepository } from '../storage/repositories/run.js';

// Step handler interface
export interface StepHandler {
  execute(step: Step, input: unknown, context: ExecutionContext): Promise<unknown>;
}

// Dependencies interface for processor
export interface ProcessorDeps {
  workflowRepository: WorkflowRepository;
  runRepository: RunRepository;
  redis: IORedis.Redis;
  enqueue: (
    queue: 'execute' | 'ai',
    message: QueueMessage,
    options?: { delay?: number }
  ) => Promise<unknown>;
  config: {
    DEFAULT_STEP_TIMEOUT_MS: number;
    MAX_STEP_OUTPUT_BYTES: number;
    MAX_CONTEXT_SIZE_BYTES: number;
  };
}

// Lock management
const LOCK_TTL = 60000; // 60 seconds
const LOCK_PREFIX = 'lock:run:';

function createLockManager(redis: IORedis.Redis) {
  return {
    async acquire(runId: string): Promise<boolean> {
      const key = `${LOCK_PREFIX}${runId}`;
      const result = await redis.set(key, '1', 'PX', LOCK_TTL, 'NX');
      return result === 'OK';
    },
    async release(runId: string): Promise<void> {
      const key = `${LOCK_PREFIX}${runId}`;
      await redis.del(key);
    },
  };
}

// Factory function to create processor with injected dependencies
export function createProcessor(deps: ProcessorDeps) {
  const { workflowRepository, runRepository, redis, enqueue, config } = deps;
  const lockManager = createLockManager(redis);

  return {
    // Process a START_RUN message
    async processStartRun(
      runId: string,
      workflowId: string,
      _handlers: Map<string, StepHandler>
    ): Promise<void> {
      const workflow = await workflowRepository.findById(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const run = await runRepository.findById(runId);
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      // Update run status to running
      await runRepository.updateStatus(runId, 'running');

      // Get enabled steps
      const enabledSteps = workflow.steps.filter(s => s.enabled);
      if (enabledSteps.length === 0) {
        // No steps to execute, complete immediately
        await runRepository.updateStatus(runId, 'completed', {
          completedAt: new Date(),
        });
        return;
      }

      // Enqueue the first step
      const firstStep = enabledSteps[0]!;
      const isAiStep = firstStep.type === 'ai';

      const message: ExecuteStepMessage = {
        type: 'EXECUTE_STEP',
        runId,
        workflowId,
        stepIndex: 0,
        stepId: firstStep.id,
        attempt: 1,
      };

      await enqueue(isAiStep ? 'ai' : 'execute', message);
    },

    // Process an EXECUTE_STEP message
    async processExecuteStep(
      job: Job,
      handlers: Map<string, StepHandler>
    ): Promise<void> {
      const msg = job.data as ExecuteStepMessage;
      const { runId, workflowId, stepIndex, stepId, attempt } = msg;

      // Try to acquire lock
      const hasLock = await lockManager.acquire(runId);
      if (!hasLock) {
        // Another worker is processing, requeue with delay
        await enqueue('execute', msg, { delay: 1000 });
        return;
      }

      try {
        // Load workflow and run
        const workflow = await workflowRepository.findById(workflowId);
        if (!workflow) {
          throw new Error(`Workflow ${workflowId} not found`);
        }

        const run = await runRepository.findById(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }

        // Check if run is still active
        if (run.status !== 'running') {
          return; // Run was cancelled or already completed
        }

        // Verify we're on the right step (idempotency check)
        if (run.currentStepIndex !== stepIndex) {
          return; // Step already processed
        }

        // Find the step
        const enabledSteps = workflow.steps.filter(s => s.enabled);
        const step = enabledSteps.find(s => s.id === stepId);
        if (!step) {
          throw new Error(`Step ${stepId} not found`);
        }

        // Get the handler
        const handler = handlers.get(step.type);
        if (!handler) {
          throw new Error(`No handler for step type: ${step.type}`);
        }

        // Resolve input (apply template expressions)
        const resolvedConfig = await resolveExpressions(step.config, run.context);

        // Create step execution record
        const execution = await runRepository.createStepExecution(
          runId,
          stepId,
          step.name,
          attempt,
          resolvedConfig
        );

        // Update execution status to running
        await runRepository.updateStepExecution(execution.id, { status: 'running' });

        const startTime = Date.now();

        try {
          // Execute the step with timeout
          const timeoutMs = step.timeoutMs ?? config.DEFAULT_STEP_TIMEOUT_MS;
          const output = await Promise.race([
            handler.execute(step, resolvedConfig, run.context),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Step timeout')), timeoutMs)
            ),
          ]);

          const durationMs = Date.now() - startTime;

          // Validate output size
          const outputStr = JSON.stringify(output);
          if (outputStr.length > config.MAX_STEP_OUTPUT_BYTES) {
            throw new Error(`Step output exceeds ${config.MAX_STEP_OUTPUT_BYTES} bytes`);
          }

          // Update step execution as completed
          await runRepository.updateStepExecution(execution.id, {
            status: 'completed',
            output,
            completedAt: new Date(),
            durationMs,
          });

          // Update run context with step output
          const newContext: ExecutionContext = {
            ...run.context,
            steps: {
              ...run.context.steps,
              [step.name]: output,
            },
          };

          // Validate context size
          const contextStr = JSON.stringify(newContext);
          if (contextStr.length > config.MAX_CONTEXT_SIZE_BYTES) {
            throw new Error(`Context exceeds ${config.MAX_CONTEXT_SIZE_BYTES} bytes`);
          }

          // Advance to next step
          const nextStepIndex = stepIndex + 1;

          await runRepository.updateStatus(runId, 'running', {
            currentStepIndex: nextStepIndex,
            context: newContext,
          });

          // Check if there are more steps
          if (nextStepIndex < enabledSteps.length) {
            const nextStep = enabledSteps[nextStepIndex]!;
            const isAiStep = nextStep.type === 'ai';

            // If current step was a delay, use BullMQ delayed job for next step
            let delay: number | undefined;
            if (step.type === 'delay') {
              const delayConfig = step.config as { type: 'delay'; durationMs: number };
              delay = delayConfig.durationMs;
            }

            const nextMessage: ExecuteStepMessage = {
              type: 'EXECUTE_STEP',
              runId,
              workflowId,
              stepIndex: nextStepIndex,
              stepId: nextStep.id,
              attempt: 1,
            };

            await enqueue(isAiStep ? 'ai' : 'execute', nextMessage, { delay });
          } else {
            // Run completed
            await runRepository.updateStatus(runId, 'completed', {
              completedAt: new Date(),
            });
          }
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const classified = classifyError(error);

          // Update step execution as failed
          await runRepository.updateStepExecution(execution.id, {
            status: 'failed',
            error: {
              code: classified.code,
              message: classified.message,
              details: classified.details,
              retryable: classified.retryable,
            },
            completedAt: new Date(),
            durationMs,
          });

          // Check retry policy
          const retryPolicy = step.retryPolicy ?? {
            maxAttempts: 3,
            backoffType: 'exponential' as const,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
          };

          if (classified.retryable && attempt < retryPolicy.maxAttempts) {
            // Schedule retry
            const delay = calculateBackoff(
              retryPolicy.backoffType,
              attempt,
              retryPolicy.initialDelayMs,
              retryPolicy.maxDelayMs
            );

            const retryMessage: ExecuteStepMessage = {
              type: 'EXECUTE_STEP',
              runId,
              workflowId,
              stepIndex,
              stepId,
              attempt: attempt + 1,
            };

            const isAiStep = step.type === 'ai';
            await enqueue(isAiStep ? 'ai' : 'execute', retryMessage, { delay });
          } else {
            // Max retries exhausted or non-retryable error
            await runRepository.updateStatus(runId, 'failed', {
              completedAt: new Date(),
              error: {
                code: classified.code,
                message: classified.message,
                details: classified.details,
                stepId,
                stepName: step.name,
              },
            });
          }
        }
      } finally {
        await lockManager.release(runId);
      }
    },
  };
}

// Legacy exports for backward compatibility
import { workflowRepository } from '../storage/repositories/workflow.js';
import { runRepository } from '../storage/repositories/run.js';
import { enqueue, redis } from '../queue/index.js';
import { config } from '../config.js';

const legacyProcessor = createProcessor({
  workflowRepository,
  runRepository,
  redis,
  enqueue,
  config,
});

export const processStartRun = legacyProcessor.processStartRun;
export const processExecuteStep = legacyProcessor.processExecuteStep;
