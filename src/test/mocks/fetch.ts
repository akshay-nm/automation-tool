import { vi } from 'vitest';

export interface MockResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  isJson?: boolean;
}

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const mockFetch = vi.fn<FetchFn>();

// Set up global fetch mock
export function setupFetchMock() {
  global.fetch = mockFetch as typeof fetch;
}

// Helper to create a mock response
export function createMockResponse(options: MockResponse): Response {
  const headers = new Headers(options.headers ?? {});
  if (options.isJson !== false && typeof options.body === 'object') {
    headers.set('content-type', 'application/json');
  }

  return {
    ok: options.ok,
    status: options.status,
    statusText: options.statusText ?? (options.ok ? 'OK' : 'Error'),
    headers,
    json: vi.fn().mockResolvedValue(options.body),
    text: vi.fn().mockResolvedValue(
      typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    ),
  } as unknown as Response;
}

// Helper to set up successful response
export function setFetchSuccess(body: unknown, status = 200, headers?: Record<string, string>) {
  const response = createMockResponse({
    ok: true,
    status,
    headers,
    body,
  });
  mockFetch.mockResolvedValueOnce(response);
  return response;
}

// Helper to set up error response
export function setFetchError(status: number, body?: unknown, headers?: Record<string, string>) {
  const response = createMockResponse({
    ok: false,
    status,
    headers,
    body,
  });
  mockFetch.mockResolvedValueOnce(response);
  return response;
}

// Helper to set up network error
export function setFetchNetworkError(message = 'Network error') {
  const error = new Error(message);
  error.name = 'TypeError';
  mockFetch.mockRejectedValueOnce(error);
}

// Helper to set up timeout error
export function setFetchTimeout() {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  mockFetch.mockRejectedValueOnce(error);
}

// Reset mock state
export function resetFetchMock() {
  mockFetch.mockReset();
}
