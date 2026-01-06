import type { StepHandler } from '../processor.js';
import type { Step, DelayStepConfig } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';

export const delayHandler: StepHandler = {
  async execute(_step: Step, input: unknown, _context: ExecutionContext): Promise<unknown> {
    const config = input as DelayStepConfig;

    // For delay steps, we use BullMQ's delayed job feature
    // This is handled by enqueueing the next step with a delay
    // The actual delay is a no-op here since it's handled at queue level
    // But we still return the delay info for logging

    return {
      delayMs: config.durationMs,
      delayedUntil: new Date(Date.now() + config.durationMs).toISOString(),
    };
  },
};

// Note: The actual delay handling is done in the processor
// When enqueueing the next step after a delay step,
// we pass the delay option to BullMQ
