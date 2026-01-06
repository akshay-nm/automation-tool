import {
  createContainer,
  asFunction,
  asValue,
  InjectionMode,
  type AwilixContainer,
} from 'awilix';
import pg from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from './config.js';
import {
  createWorkflowRepository,
  type WorkflowRepository,
} from './storage/repositories/workflow.js';
import { createRunRepository, type RunRepository } from './storage/repositories/run.js';
import type { StepHandler } from './workers/processor.js';

const { Pool } = pg;

// Type definition for the DI container's cradle
export interface Cradle {
  // Config
  config: typeof config;

  // Database
  pool: pg.Pool;
  query: <T extends pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
  withTransaction: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;

  // Repositories
  workflowRepository: WorkflowRepository;
  runRepository: RunRepository;

  // Redis & Queues
  redis: IORedis.Redis;
  executeQueue: Queue;
  aiQueue: Queue;
  enqueue: (
    queue: 'execute' | 'ai',
    message: unknown,
    options?: { delay?: number }
  ) => Promise<unknown>;

  // Step handlers (registered by workers)
  handlers: Map<string, StepHandler>;
}

// Factory functions for database layer
function createPool({ config }: Pick<Cradle, 'config'>): pg.Pool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

function createQueryFn({ pool }: Pick<Cradle, 'pool'>) {
  return async <T extends pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<pg.QueryResult<T>> => {
    return pool.query<T>(text, values);
  };
}

function createWithTransaction({ pool }: Pick<Cradle, 'pool'>) {
  return async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}

// Factory functions for Redis & Queues
function createRedis({ config }: Pick<Cradle, 'config'>): IORedis.Redis {
  return new IORedis.default(config.REDIS_URL);
}

function createExecuteQueue({ config }: Pick<Cradle, 'config'>): Queue {
  const connectionOptions = {
    host: new URL(config.REDIS_URL).hostname || 'localhost',
    port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
    maxRetriesPerRequest: null,
  };

  return new Queue('workflow.execute', {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

function createAiQueue({ config }: Pick<Cradle, 'config'>): Queue {
  const connectionOptions = {
    host: new URL(config.REDIS_URL).hostname || 'localhost',
    port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
    maxRetriesPerRequest: null,
  };

  return new Queue('workflow.ai', {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

function createEnqueue({
  executeQueue,
  aiQueue,
}: Pick<Cradle, 'executeQueue' | 'aiQueue'>) {
  return async (
    queue: 'execute' | 'ai',
    message: unknown,
    options?: { delay?: number }
  ) => {
    const q = queue === 'execute' ? executeQueue : aiQueue;
    const msg = message as { type: string };
    return q.add(msg.type, message, { delay: options?.delay });
  };
}

// Create the container
export function createAppContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    // Config (singleton)
    config: asValue(config),

    // Database layer (singletons)
    pool: asFunction(createPool).singleton().disposer(pool => pool.end()),
    query: asFunction(createQueryFn).singleton(),
    withTransaction: asFunction(createWithTransaction).singleton(),

    // Repositories (singletons)
    workflowRepository: asFunction(createWorkflowRepository).singleton(),
    runRepository: asFunction(createRunRepository).singleton(),

    // Redis & Queues (singletons)
    redis: asFunction(createRedis)
      .singleton()
      .disposer(redis => redis.quit()),
    executeQueue: asFunction(createExecuteQueue)
      .singleton()
      .disposer(queue => queue.close()),
    aiQueue: asFunction(createAiQueue)
      .singleton()
      .disposer(queue => queue.close()),
    enqueue: asFunction(createEnqueue).singleton(),

    // Handlers placeholder (will be registered by workers)
    handlers: asValue(new Map<string, StepHandler>()),
  });

  return container;
}

// Default container instance for the application
let defaultContainer: AwilixContainer<Cradle> | null = null;

export function getContainer(): AwilixContainer<Cradle> {
  if (!defaultContainer) {
    defaultContainer = createAppContainer();
  }
  return defaultContainer;
}

// For testing - allows setting a mock container
export function setContainer(container: AwilixContainer<Cradle> | null): void {
  defaultContainer = container;
}

// Graceful shutdown helper
export async function disposeContainer(): Promise<void> {
  if (defaultContainer) {
    await defaultContainer.dispose();
    defaultContainer = null;
  }
}
