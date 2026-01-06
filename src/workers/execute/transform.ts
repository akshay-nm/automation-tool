import type { StepHandler } from '../processor.js';
import type { Step, TransformStepConfig } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';
import { evaluateTransform } from '../../domain/services/expression.js';
import { WorkflowError, ErrorCategory } from '../../domain/errors.js';

export const transformHandler: StepHandler = {
  async execute(_step: Step, input: unknown, context: ExecutionContext): Promise<unknown> {
    const config = input as TransformStepConfig;

    try {
      const result = await evaluateTransform(config.expression, context);
      return { [config.outputKey]: result };
    } catch (error) {
      // Wrap all errors (including JSONata compilation errors) in WorkflowError
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkflowError(
        'TRANSFORM_ERROR',
        `Transform failed: ${message}`,
        ErrorCategory.VALIDATION,
        { expression: config.expression }
      );
    }
  },
};
