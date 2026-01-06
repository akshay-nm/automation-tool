import { vi } from 'vitest';
import type pg from 'pg';

type QueryFn = (query: string, values?: unknown[]) => Promise<pg.QueryResult<Record<string, unknown>>>;

export const mockQuery = vi.fn<QueryFn>();

export const mockPoolClient = {
  query: mockQuery,
  release: vi.fn(),
};

export const mockPool = {
  query: mockQuery,
  connect: vi.fn().mockResolvedValue(mockPoolClient),
  end: vi.fn().mockResolvedValue(undefined),
};

// Helper to set up query result
export function setQueryResult(rows: Record<string, unknown>[], rowCount?: number) {
  mockQuery.mockResolvedValueOnce({
    rows,
    rowCount: rowCount ?? rows.length,
    command: '',
    oid: 0,
    fields: [],
  });
}

// Helper to set up query error
export function setQueryError(error: Error) {
  mockQuery.mockRejectedValueOnce(error);
}

// Reset mock state
export function resetDbMock() {
  mockQuery.mockReset();
  mockPoolClient.release.mockReset();
  mockPool.connect.mockReset().mockResolvedValue(mockPoolClient);
  mockPool.end.mockReset().mockResolvedValue(undefined);
}
