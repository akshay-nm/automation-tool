import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLMStudio } from './lmstudio.js';
import { WorkflowError, ErrorCategory } from '../../domain/errors.js';
import {
  mockFetch,
  setupFetchMock,
  resetFetchMock,
  createMockResponse,
} from '../../test/mocks/fetch.js';

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    LM_STUDIO_URL: 'http://localhost:1234/v1',
  },
}));

describe('callLMStudio', () => {
  beforeEach(() => {
    setupFetchMock();
    resetFetchMock();
    vi.useFakeTimers();
  });

  const successResponse = {
    id: 'chatcmpl-123',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is the AI response.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };

  describe('successful requests', () => {
    it('should make a chat completion request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      const result = await callLMStudio({
        model: 'local-model',
        prompt: 'Hello, world!',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:1234/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.content).toBe('This is the AI response.');
    });

    it('should include model in request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      await callLMStudio({
        model: 'custom-model',
        prompt: 'Test prompt',
      });

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]?.body as string);
      expect(body.model).toBe('custom-model');
    });

    it('should include user message in request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      await callLMStudio({
        model: 'local-model',
        prompt: 'User prompt here',
      });

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]?.body as string);
      expect(body.messages).toContainEqual({
        role: 'user',
        content: 'User prompt here',
      });
    });

    it('should include system prompt when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      await callLMStudio({
        model: 'local-model',
        prompt: 'User prompt',
        systemPrompt: 'You are a helpful assistant.',
      });

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]?.body as string);
      expect(body.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
      expect(body.messages[1]).toEqual({
        role: 'user',
        content: 'User prompt',
      });
    });

    it('should include maxTokens when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      await callLMStudio({
        model: 'local-model',
        prompt: 'Test',
        maxTokens: 500,
      });

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]?.body as string);
      expect(body.max_tokens).toBe(500);
    });

    it('should include temperature when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      await callLMStudio({
        model: 'local-model',
        prompt: 'Test',
        temperature: 0.7,
      });

      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1]?.body as string);
      expect(body.temperature).toBe(0.7);
    });
  });

  describe('response parsing', () => {
    it('should return content from first choice', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      const result = await callLMStudio({
        model: 'local-model',
        prompt: 'Test',
      });

      expect(result.content).toBe('This is the AI response.');
    });

    it('should return usage metrics', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: successResponse })
      );

      const result = await callLMStudio({
        model: 'local-model',
        prompt: 'Test',
      });

      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should handle missing usage data', async () => {
      const responseWithoutUsage = {
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: responseWithoutUsage })
      );

      const result = await callLMStudio({
        model: 'local-model',
        prompt: 'Test',
      });

      expect(result.usage).toBeUndefined();
    });

    it('should throw error when no choices returned', async () => {
      const emptyChoicesResponse = {
        id: 'chatcmpl-123',
        choices: [],
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, status: 200, body: emptyChoicesResponse })
      );

      const promise = callLMStudio({
        model: 'local-model',
        prompt: 'Test',
      });

      await expect(promise).rejects.toThrow(WorkflowError);
      await expect(promise).rejects.toMatchObject({
        code: 'AI_NO_RESPONSE',
        category: ErrorCategory.TRANSIENT,
      });
    });
  });

  describe('error handling', () => {
    describe('HTTP errors', () => {
      it('should throw TRANSIENT error for 5xx', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockResponse({ ok: false, status: 500, body: { error: 'Server error' } })
        );

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.TRANSIENT,
        });
      });

      it('should throw TRANSIENT error for 429', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockResponse({ ok: false, status: 429, body: { error: 'Rate limited' } })
        );

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.TRANSIENT,
        });
      });

      it('should throw FATAL error for 4xx', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockResponse({ ok: false, status: 400, body: { error: 'Bad request' } })
        );

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.FATAL,
        });
      });

      it('should include status in error details', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockResponse({ ok: false, status: 503, body: {} })
        );

        try {
          await callLMStudio({
            model: 'local-model',
            prompt: 'Test',
          });
        } catch (error) {
          expect((error as WorkflowError).details).toMatchObject({
            status: 503,
          });
        }
      });
    });

    describe('timeout', () => {
      it('should throw TRANSIENT error on timeout', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValueOnce(abortError);

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          code: 'AI_TIMEOUT',
          category: ErrorCategory.TRANSIENT,
        });
      });
    });

    describe('connection errors', () => {
      it('should throw AI_UNAVAILABLE for ECONNREFUSED', async () => {
        const connError = new Error('connect ECONNREFUSED 127.0.0.1:1234');
        mockFetch.mockRejectedValueOnce(connError);

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          code: 'AI_UNAVAILABLE',
          category: ErrorCategory.TRANSIENT,
          message: expect.stringContaining('not available'),
        });
      });

      it('should throw AI_ERROR for other network errors', async () => {
        const networkError = new Error('Network unreachable');
        mockFetch.mockRejectedValueOnce(networkError);

        const promise = callLMStudio({
          model: 'local-model',
          prompt: 'Test',
        });

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          code: 'AI_ERROR',
          category: ErrorCategory.TRANSIENT,
        });
      });
    });

    it('should re-throw non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      await expect(
        callLMStudio({ model: 'local-model', prompt: 'Test' })
      ).rejects.toBe('string error');
    });
  });
});
