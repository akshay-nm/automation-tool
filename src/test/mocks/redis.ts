import { vi } from 'vitest';

export const mockRedis = {
  set: vi.fn().mockResolvedValue('OK') as ReturnType<typeof vi.fn<(key: string, value: string, ...args: unknown[]) => Promise<string | null>>>,
  get: vi.fn().mockResolvedValue(null) as ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>,
  del: vi.fn().mockResolvedValue(1) as ReturnType<typeof vi.fn<(key: string) => Promise<number>>>,
  expire: vi.fn().mockResolvedValue(1) as ReturnType<typeof vi.fn<(key: string, seconds: number) => Promise<number>>>,
  quit: vi.fn().mockResolvedValue('OK') as ReturnType<typeof vi.fn<() => Promise<string>>>,
  eval: vi.fn().mockResolvedValue(null) as ReturnType<typeof vi.fn<(script: string, numKeys: number, ...args: unknown[]) => Promise<unknown>>>,
};

// Helper to set up get result
export function setRedisGetResult(value: string | null) {
  mockRedis.get.mockResolvedValueOnce(value);
}

// Helper to simulate lock acquisition success/failure
export function setLockResult(success: boolean) {
  mockRedis.set.mockResolvedValueOnce(success ? 'OK' : null);
}

// Reset mock state
export function resetRedisMock() {
  mockRedis.set.mockReset().mockResolvedValue('OK');
  mockRedis.get.mockReset().mockResolvedValue(null);
  mockRedis.del.mockReset().mockResolvedValue(1);
  mockRedis.expire.mockReset().mockResolvedValue(1);
  mockRedis.quit.mockReset().mockResolvedValue('OK');
  mockRedis.eval.mockReset().mockResolvedValue(null);
}
