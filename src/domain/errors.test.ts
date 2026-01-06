import { describe, it, expect, vi } from 'vitest';
import {
  ErrorCategory,
  WorkflowError,
  classifyHttpError,
  classifyError,
  calculateBackoff,
} from './errors.js';

describe('ErrorCategory', () => {
  it('should have all expected categories', () => {
    expect(ErrorCategory.TRANSIENT).toBe('TRANSIENT');
    expect(ErrorCategory.RESOURCE).toBe('RESOURCE');
    expect(ErrorCategory.VALIDATION).toBe('VALIDATION');
    expect(ErrorCategory.AUTHORIZATION).toBe('AUTHORIZATION');
    expect(ErrorCategory.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCategory.FATAL).toBe('FATAL');
  });
});

describe('WorkflowError', () => {
  it('should create error with all properties', () => {
    const error = new WorkflowError(
      'TEST_ERROR',
      'Test message',
      ErrorCategory.VALIDATION,
      { field: 'name' }
    );

    expect(error.name).toBe('WorkflowError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.details).toEqual({ field: 'name' });
    expect(error.retryable).toBe(false);
  });

  it('should be retryable for TRANSIENT category', () => {
    const error = new WorkflowError('TIMEOUT', 'Timed out', ErrorCategory.TRANSIENT);
    expect(error.retryable).toBe(true);
  });

  it('should be retryable for RESOURCE category', () => {
    const error = new WorkflowError('POOL_EXHAUSTED', 'No connections', ErrorCategory.RESOURCE);
    expect(error.retryable).toBe(true);
  });

  it('should not be retryable for VALIDATION category', () => {
    const error = new WorkflowError('BAD_INPUT', 'Invalid', ErrorCategory.VALIDATION);
    expect(error.retryable).toBe(false);
  });

  it('should not be retryable for AUTHORIZATION category', () => {
    const error = new WorkflowError('UNAUTHORIZED', 'Not allowed', ErrorCategory.AUTHORIZATION);
    expect(error.retryable).toBe(false);
  });

  it('should not be retryable for NOT_FOUND category', () => {
    const error = new WorkflowError('NOT_FOUND', 'Missing', ErrorCategory.NOT_FOUND);
    expect(error.retryable).toBe(false);
  });

  it('should not be retryable for FATAL category', () => {
    const error = new WorkflowError('FATAL', 'Crashed', ErrorCategory.FATAL);
    expect(error.retryable).toBe(false);
  });

  describe('toClassified()', () => {
    it('should convert to ClassifiedError', () => {
      const error = new WorkflowError(
        'TEST_ERROR',
        'Test message',
        ErrorCategory.TRANSIENT,
        { retry: true }
      );

      const classified = error.toClassified();

      expect(classified).toEqual({
        category: ErrorCategory.TRANSIENT,
        retryable: true,
        code: 'TEST_ERROR',
        message: 'Test message',
        details: { retry: true },
      });
    });

    it('should handle missing details', () => {
      const error = new WorkflowError('TEST', 'Test', ErrorCategory.FATAL);
      const classified = error.toClassified();

      expect(classified.details).toBeUndefined();
    });
  });
});

describe('classifyHttpError', () => {
  describe('5xx server errors', () => {
    it.each([500, 501, 502, 503, 504, 599])('should classify %d as TRANSIENT', (status) => {
      const result = classifyHttpError(status);

      expect(result.category).toBe(ErrorCategory.TRANSIENT);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe(`HTTP_${status}`);
    });

    it('should use custom message', () => {
      const result = classifyHttpError(500, 'Custom server error');
      expect(result.message).toBe('Custom server error');
    });

    it('should use default message', () => {
      const result = classifyHttpError(500);
      expect(result.message).toBe('Server error: 500');
    });
  });

  describe('rate limiting (429)', () => {
    it('should classify 429 as TRANSIENT', () => {
      const result = classifyHttpError(429);

      expect(result.category).toBe(ErrorCategory.TRANSIENT);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('HTTP_429');
      expect(result.message).toBe('Rate limited');
    });

    it('should use custom message for 429', () => {
      const result = classifyHttpError(429, 'Too many requests');
      expect(result.message).toBe('Too many requests');
    });
  });

  describe('authorization errors', () => {
    it('should classify 401 as AUTHORIZATION', () => {
      const result = classifyHttpError(401);

      expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('HTTP_401');
    });

    it('should classify 403 as AUTHORIZATION', () => {
      const result = classifyHttpError(403);

      expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('HTTP_403');
    });

    it('should use default message', () => {
      const result = classifyHttpError(401);
      expect(result.message).toBe('Authorization failed');
    });
  });

  describe('not found (404)', () => {
    it('should classify 404 as NOT_FOUND', () => {
      const result = classifyHttpError(404);

      expect(result.category).toBe(ErrorCategory.NOT_FOUND);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('HTTP_404');
      expect(result.message).toBe('Resource not found');
    });
  });

  describe('4xx client errors', () => {
    it.each([400, 405, 408, 409, 410, 415, 422])('should classify %d as VALIDATION', (status) => {
      const result = classifyHttpError(status);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe(`HTTP_${status}`);
    });

    it('should use default message', () => {
      const result = classifyHttpError(400);
      expect(result.message).toBe('Client error: 400');
    });
  });

  describe('unexpected status codes', () => {
    it.each([0, 100, 200, 201, 204, 301, 302])('should classify %d as FATAL', (status) => {
      const result = classifyHttpError(status);

      expect(result.category).toBe(ErrorCategory.FATAL);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe(`HTTP_${status}`);
    });
  });
});

describe('classifyError', () => {
  it('should pass through WorkflowError', () => {
    const error = new WorkflowError('TEST', 'Test', ErrorCategory.TRANSIENT, { x: 1 });
    const result = classifyError(error);

    expect(result).toEqual(error.toClassified());
  });

  describe('network errors', () => {
    it.each([
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'socket hang up',
    ])('should classify "%s" as TRANSIENT network error', (errorType) => {
      const error = new Error(`Connection failed: ${errorType}`);
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.TRANSIENT);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('NETWORK_ERROR');
    });
  });

  describe('timeout errors', () => {
    it('should classify errors with "timeout" in message as TRANSIENT', () => {
      const error = new Error('Request timeout after 30s');
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.TRANSIENT);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('TIMEOUT');
    });

    it('should classify TimeoutError by name as TRANSIENT', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.TRANSIENT);
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('TIMEOUT');
    });
  });

  describe('validation errors', () => {
    it('should classify ZodError as VALIDATION', () => {
      const error = new Error('Validation failed');
      error.name = 'ZodError';
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should classify ValidationError as VALIDATION', () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('unknown errors', () => {
    it('should classify generic Error as FATAL', () => {
      const error = new Error('Something went wrong');
      const result = classifyError(error);

      expect(result.category).toBe(ErrorCategory.FATAL);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('should handle non-Error objects', () => {
      const result = classifyError('string error');

      expect(result.category).toBe(ErrorCategory.FATAL);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('string error');
    });

    it('should handle null', () => {
      const result = classifyError(null);

      expect(result.category).toBe(ErrorCategory.FATAL);
      expect(result.message).toBe('null');
    });

    it('should handle undefined', () => {
      const result = classifyError(undefined);

      expect(result.category).toBe(ErrorCategory.FATAL);
      expect(result.message).toBe('undefined');
    });
  });
});

describe('calculateBackoff', () => {
  // Mock Math.random for predictable jitter tests
  const mockRandom = (value: number) => {
    vi.spyOn(Math, 'random').mockReturnValue(value);
  };

  describe('fixed backoff', () => {
    it('should return initialDelayMs regardless of attempt', () => {
      mockRandom(0); // Minimum jitter (10%)

      expect(calculateBackoff('fixed', 1, 1000, 60000)).toBeCloseTo(1100, -1);
      expect(calculateBackoff('fixed', 2, 1000, 60000)).toBeCloseTo(1100, -1);
      expect(calculateBackoff('fixed', 5, 1000, 60000)).toBeCloseTo(1100, -1);
    });
  });

  describe('linear backoff', () => {
    it('should multiply initialDelayMs by attempt number', () => {
      mockRandom(0); // Minimum jitter (10%)

      expect(calculateBackoff('linear', 1, 1000, 60000)).toBeCloseTo(1100, -1);
      expect(calculateBackoff('linear', 2, 1000, 60000)).toBeCloseTo(2200, -1);
      expect(calculateBackoff('linear', 3, 1000, 60000)).toBeCloseTo(3300, -1);
    });
  });

  describe('exponential backoff', () => {
    it('should double delay for each attempt', () => {
      mockRandom(0); // Minimum jitter (10%)

      expect(calculateBackoff('exponential', 1, 1000, 60000)).toBeCloseTo(1100, -1);
      expect(calculateBackoff('exponential', 2, 1000, 60000)).toBeCloseTo(2200, -1);
      expect(calculateBackoff('exponential', 3, 1000, 60000)).toBeCloseTo(4400, -1);
      expect(calculateBackoff('exponential', 4, 1000, 60000)).toBeCloseTo(8800, -1);
    });
  });

  describe('jitter', () => {
    it('should add 10% jitter at minimum', () => {
      mockRandom(0);
      const result = calculateBackoff('fixed', 1, 1000, 60000);
      expect(result).toBe(1100); // 1000 + 10%
    });

    it('should add 20% jitter at maximum', () => {
      mockRandom(1);
      const result = calculateBackoff('fixed', 1, 1000, 60000);
      expect(result).toBe(1200); // 1000 + 20%
    });

    it('should add random jitter between 10-20%', () => {
      mockRandom(0.5);
      const result = calculateBackoff('fixed', 1, 1000, 60000);
      expect(result).toBe(1150); // 1000 + 15%
    });
  });

  describe('maxDelay cap', () => {
    it('should cap delay at maxDelayMs', () => {
      mockRandom(0);

      const result = calculateBackoff('exponential', 10, 1000, 60000);
      expect(result).toBe(60000);
    });

    it('should cap delay even with jitter', () => {
      mockRandom(1);

      const result = calculateBackoff('exponential', 10, 1000, 60000);
      expect(result).toBe(60000);
    });

    it('should not cap when under limit', () => {
      mockRandom(0);

      const result = calculateBackoff('exponential', 5, 1000, 60000);
      expect(result).toBeLessThan(60000);
    });
  });
});
