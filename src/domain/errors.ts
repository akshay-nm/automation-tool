// Error categories
export enum ErrorCategory {
  TRANSIENT = 'TRANSIENT',     // Network timeout, 5xx, rate limit
  RESOURCE = 'RESOURCE',       // Connection pool exhausted
  VALIDATION = 'VALIDATION',   // Bad config, invalid input
  AUTHORIZATION = 'AUTHORIZATION', // Auth failed
  NOT_FOUND = 'NOT_FOUND',     // Resource doesn't exist
  FATAL = 'FATAL',             // Unrecoverable error
}

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  code: string;
  message: string;
  details?: unknown;
}

export class WorkflowError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    category: ErrorCategory,
    details?: unknown
  ) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.category = category;
    this.retryable = category === ErrorCategory.TRANSIENT || category === ErrorCategory.RESOURCE;
    this.details = details;
  }

  toClassified(): ClassifiedError {
    return {
      category: this.category,
      retryable: this.retryable,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// Classify HTTP errors
export function classifyHttpError(status: number, message?: string): ClassifiedError {
  if (status >= 500 && status < 600) {
    return {
      category: ErrorCategory.TRANSIENT,
      retryable: true,
      code: `HTTP_${status}`,
      message: message ?? `Server error: ${status}`,
    };
  }
  if (status === 429) {
    return {
      category: ErrorCategory.TRANSIENT,
      retryable: true,
      code: 'HTTP_429',
      message: message ?? 'Rate limited',
    };
  }
  if (status === 401 || status === 403) {
    return {
      category: ErrorCategory.AUTHORIZATION,
      retryable: false,
      code: `HTTP_${status}`,
      message: message ?? 'Authorization failed',
    };
  }
  if (status === 404) {
    return {
      category: ErrorCategory.NOT_FOUND,
      retryable: false,
      code: 'HTTP_404',
      message: message ?? 'Resource not found',
    };
  }
  if (status >= 400 && status < 500) {
    return {
      category: ErrorCategory.VALIDATION,
      retryable: false,
      code: `HTTP_${status}`,
      message: message ?? `Client error: ${status}`,
    };
  }
  return {
    category: ErrorCategory.FATAL,
    retryable: false,
    code: `HTTP_${status}`,
    message: message ?? `Unexpected status: ${status}`,
  };
}

// Classify generic errors
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof WorkflowError) {
    return error.toClassified();
  }

  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('socket hang up')) {
      return {
        category: ErrorCategory.TRANSIENT,
        retryable: true,
        code: 'NETWORK_ERROR',
        message: error.message,
      };
    }

    // Timeout errors
    if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      return {
        category: ErrorCategory.TRANSIENT,
        retryable: true,
        code: 'TIMEOUT',
        message: error.message,
      };
    }

    // Validation errors
    if (error.name === 'ZodError' || error.name === 'ValidationError') {
      return {
        category: ErrorCategory.VALIDATION,
        retryable: false,
        code: 'VALIDATION_ERROR',
        message: error.message,
      };
    }
  }

  return {
    category: ErrorCategory.FATAL,
    retryable: false,
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

// Calculate backoff delay
export function calculateBackoff(
  backoffType: 'fixed' | 'exponential' | 'linear',
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number
): number {
  let delay: number;

  switch (backoffType) {
    case 'fixed':
      delay = initialDelayMs;
      break;
    case 'linear':
      delay = initialDelayMs * attempt;
      break;
    case 'exponential':
      delay = initialDelayMs * Math.pow(2, attempt - 1);
      break;
  }

  // Add jitter (10-20% random variance)
  const jitter = delay * (0.1 + Math.random() * 0.1);
  delay += jitter;

  return Math.min(delay, maxDelayMs);
}
