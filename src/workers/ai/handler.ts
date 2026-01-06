import type { StepHandler } from '../processor.js';
import type { Step, AiStepConfig } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';
import { callLMStudio } from './lmstudio.js';

export const aiHandler: StepHandler = {
  async execute(_step: Step, input: unknown, _context: ExecutionContext): Promise<unknown> {
    const config = input as AiStepConfig;

    const result = await callLMStudio({
      model: config.model,
      prompt: config.prompt,
      systemPrompt: config.systemPrompt,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    return {
      [config.outputKey]: result.content,
      _meta: {
        usage: result.usage,
      },
    };
  },
};
