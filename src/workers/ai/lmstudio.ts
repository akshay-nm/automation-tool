import { config } from '../../config.js';
import { WorkflowError, ErrorCategory, classifyHttpError } from '../../domain/errors.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LMStudioOptions {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callLMStudio(options: LMStudioOptions): Promise<{
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const messages: ChatMessage[] = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  messages.push({ role: 'user', content: options.prompt });

  const request: ChatCompletionRequest = {
    model: options.model,
    messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout for AI

  try {
    const response = await fetch(`${config.LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = classifyHttpError(response.status);
      throw new WorkflowError(
        error.code,
        `LM Studio error: ${error.message}`,
        error.retryable ? ErrorCategory.TRANSIENT : ErrorCategory.FATAL,
        { status: response.status }
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;

    const choice = data.choices[0];
    if (!choice) {
      throw new WorkflowError(
        'AI_NO_RESPONSE',
        'LM Studio returned no choices',
        ErrorCategory.TRANSIENT
      );
    }

    return {
      content: choice.message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof WorkflowError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new WorkflowError(
          'AI_TIMEOUT',
          'LM Studio request timed out',
          ErrorCategory.TRANSIENT
        );
      }

      // Connection errors
      if (error.message.includes('ECONNREFUSED')) {
        throw new WorkflowError(
          'AI_UNAVAILABLE',
          'LM Studio is not available. Make sure it is running.',
          ErrorCategory.TRANSIENT
        );
      }

      throw new WorkflowError(
        'AI_ERROR',
        error.message,
        ErrorCategory.TRANSIENT
      );
    }

    throw error;
  }
}
