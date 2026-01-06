import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpHandler } from './http.js';
import { WorkflowError, ErrorCategory } from '../../domain/errors.js';
import type { Step } from '../../domain/entities/workflow.js';
import type { ExecutionContext } from '../../domain/entities/run.js';
import {
  mockFetch,
  setupFetchMock,
  setFetchSuccess,
  setFetchError,
  setFetchNetworkError,
  setFetchTimeout,
  resetFetchMock,
} from '../../test/mocks/fetch.js';

describe('httpHandler', () => {
  const mockStep: Step = {
    id: 'step-1',
    workflowId: 'wf-1',
    order: 0,
    name: 'HTTP Step',
    type: 'http',
    config: {
      type: 'http',
      method: 'GET',
      url: 'https://api.example.com',
    },
    retryPolicy: {
      maxAttempts: 3,
      backoffType: 'exponential',
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    timeoutMs: 30000,
    enabled: true,
  };

  const mockContext: ExecutionContext = {
    trigger: {
      method: 'POST',
      headers: {},
      body: {},
      query: {},
      receivedAt: new Date(),
    },
    steps: {},
    variables: {},
  };

  beforeEach(() => {
    setupFetchMock();
    resetFetchMock();
    vi.useFakeTimers();
  });

  describe('successful requests', () => {
    it('should execute GET request', async () => {
      setFetchSuccess({ data: 'test' });

      const result = await httpHandler.execute(
        mockStep,
        { method: 'GET', url: 'https://api.example.com/data' },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toMatchObject({
        status: 200,
        body: { data: 'test' },
      });
    });

    it('should execute POST request with body', async () => {
      setFetchSuccess({ id: 123 }, 201);

      const result = await httpHandler.execute(
        mockStep,
        {
          method: 'POST',
          url: 'https://api.example.com/items',
          body: { name: 'test' },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        })
      );
      expect(result).toMatchObject({
        status: 201,
        body: { id: 123 },
      });
    });

    it('should execute PUT request', async () => {
      setFetchSuccess({ updated: true });

      await httpHandler.execute(
        mockStep,
        {
          method: 'PUT',
          url: 'https://api.example.com/items/1',
          body: { name: 'updated' },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should execute PATCH request', async () => {
      setFetchSuccess({ patched: true });

      await httpHandler.execute(
        mockStep,
        {
          method: 'PATCH',
          url: 'https://api.example.com/items/1',
          body: { name: 'patched' },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should execute DELETE request', async () => {
      setFetchSuccess({}, 204);

      await httpHandler.execute(
        mockStep,
        { method: 'DELETE', url: 'https://api.example.com/items/1' },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should not include body for GET requests', async () => {
      setFetchSuccess({});

      await httpHandler.execute(
        mockStep,
        {
          method: 'GET',
          url: 'https://api.example.com/data',
          body: { ignored: true },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.not.objectContaining({ body: expect.anything() })
      );
    });
  });

  describe('headers', () => {
    it('should set default Content-Type header', async () => {
      setFetchSuccess({});

      await httpHandler.execute(
        mockStep,
        { method: 'GET', url: 'https://api.example.com/data' },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should allow custom headers', async () => {
      setFetchSuccess({});

      await httpHandler.execute(
        mockStep,
        {
          method: 'GET',
          url: 'https://api.example.com/data',
          headers: { Authorization: 'Bearer token123' },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should override default Content-Type', async () => {
      setFetchSuccess({});

      await httpHandler.execute(
        mockStep,
        {
          method: 'GET',
          url: 'https://api.example.com/data',
          headers: { 'Content-Type': 'text/plain' },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/plain',
          }),
        })
      );
    });
  });

  describe('response parsing', () => {
    it('should parse JSON response', async () => {
      setFetchSuccess({ key: 'value' });

      const result = await httpHandler.execute(
        mockStep,
        { method: 'GET', url: 'https://api.example.com/data' },
        mockContext
      );

      expect(result).toMatchObject({
        body: { key: 'value' },
      });
    });

    it('should return headers in response', async () => {
      setFetchSuccess({}, 200, { 'x-request-id': 'req-123' });

      const result = (await httpHandler.execute(
        mockStep,
        { method: 'GET', url: 'https://api.example.com/data' },
        mockContext
      )) as { headers: Record<string, string> };

      expect(result.headers).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    it('should use default 30s timeout', async () => {
      setFetchTimeout();

      const promise = httpHandler.execute(
        mockStep,
        { method: 'GET', url: 'https://api.example.com/data' },
        mockContext
      );

      await expect(promise).rejects.toThrow(WorkflowError);
      await expect(promise).rejects.toMatchObject({
        code: 'TIMEOUT',
        category: ErrorCategory.TRANSIENT,
      });
    });

    it('should use custom timeout', async () => {
      setFetchTimeout();

      const promise = httpHandler.execute(
        mockStep,
        {
          method: 'GET',
          url: 'https://api.example.com/data',
          timeoutMs: 5000,
        },
        mockContext
      );

      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('5000'),
      });
    });
  });

  describe('error handling', () => {
    describe('5xx server errors', () => {
      it.each([500, 502, 503, 504])('should throw TRANSIENT error for %d', async (status) => {
        setFetchError(status, { error: 'Server error' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.TRANSIENT,
        });
      });
    });

    describe('4xx client errors', () => {
      it('should throw AUTHORIZATION error for 401', async () => {
        setFetchError(401, { error: 'Unauthorized' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.AUTHORIZATION,
        });
      });

      it('should throw AUTHORIZATION error for 403', async () => {
        setFetchError(403, { error: 'Forbidden' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.AUTHORIZATION,
        });
      });

      it('should throw NOT_FOUND error for 404', async () => {
        setFetchError(404, { error: 'Not found' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.NOT_FOUND,
        });
      });

      it('should throw TRANSIENT error for 429', async () => {
        setFetchError(429, { error: 'Rate limited' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.TRANSIENT,
        });
      });

      it('should throw FATAL error for other 4xx', async () => {
        setFetchError(400, { error: 'Bad request' });

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toMatchObject({
          category: ErrorCategory.VALIDATION,
        });
      });
    });

    describe('network errors', () => {
      it('should throw TRANSIENT error for network failure', async () => {
        setFetchNetworkError('Network unreachable');

        const promise = httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );

        await expect(promise).rejects.toThrow(WorkflowError);
        await expect(promise).rejects.toMatchObject({
          code: 'NETWORK_ERROR',
          category: ErrorCategory.TRANSIENT,
        });
      });
    });

    it('should include status and body in error details', async () => {
      setFetchError(500, { message: 'Internal error' });

      try {
        await httpHandler.execute(
          mockStep,
          { method: 'GET', url: 'https://api.example.com/data' },
          mockContext
        );
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).details).toMatchObject({
          status: 500,
          body: { message: 'Internal error' },
        });
      }
    });
  });
});
