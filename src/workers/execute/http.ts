import type { StepHandler } from '../processor.js';
import type { Step, HttpStepConfig } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';
import { classifyHttpError, WorkflowError, ErrorCategory } from '../../domain/errors.js';

export const httpHandler: StepHandler = {
  async execute(_step: Step, input: unknown, _context: ExecutionContext): Promise<unknown> {
    const config = input as HttpStepConfig;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    const options: RequestInit = {
      method: config.method,
      headers,
    };

    if (config.body && config.method !== 'GET') {
      options.body = JSON.stringify(config.body);
    }

    const timeoutMs = config.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;

    try {
      const response = await fetch(config.url, options);
      clearTimeout(timeout);

      // Read response body
      const contentType = response.headers.get('content-type') ?? '';
      let body: unknown;

      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      // Check for error status
      if (!response.ok) {
        const error = classifyHttpError(response.status, `HTTP ${response.status}`);
        throw new WorkflowError(
          error.code,
          error.message,
          error.category,
          { status: response.status, body }
        );
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof WorkflowError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new WorkflowError(
            'TIMEOUT',
            `Request timeout after ${timeoutMs}ms`,
            ErrorCategory.TRANSIENT
          );
        }

        // Network errors
        throw new WorkflowError(
          'NETWORK_ERROR',
          error.message,
          ErrorCategory.TRANSIENT
        );
      }

      throw error;
    }
  },
};
