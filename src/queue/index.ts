import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import type { QueueMessage } from './messages.js';

// Queue names
export const QUEUE_EXECUTE = 'workflow.execute';
export const QUEUE_AI = 'workflow.ai';

// Type for enqueue function
export type EnqueueFn = (
  queue: 'execute' | 'ai',
  message: QueueMessage,
  options?: { delay?: number }
) => Promise<Job>;

// Factory function to create Redis connection options from URL
export function createConnectionOptions(redisUrl: string) {
  return {
    host: new URL(redisUrl).hostname || 'localhost',
    port: parseInt(new URL(redisUrl).port || '6379', 10),
    maxRetriesPerRequest: null,
  };
}

// Factory function to create Redis instance
export function createRedis(redisUrl: string): IORedis.Redis {
  return new IORedis.default(redisUrl);
}

// Factory function to create execute queue
export function createExecuteQueue(redisUrl: string): Queue {
  const connectionOptions = createConnectionOptions(redisUrl);
  return new Queue(QUEUE_EXECUTE, {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 1, // We handle retries at the step level
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

// Factory function to create AI queue
export function createAiQueue(redisUrl: string): Queue {
  const connectionOptions = createConnectionOptions(redisUrl);
  return new Queue(QUEUE_AI, {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

// Factory function to create enqueue helper
export function createEnqueueFn(
  executeQueue: Queue,
  aiQueue: Queue
): EnqueueFn {
  return async (
    queue: 'execute' | 'ai',
    message: QueueMessage,
    options?: { delay?: number }
  ): Promise<Job> => {
    const q = queue === 'execute' ? executeQueue : aiQueue;
    return q.add(message.type, message, {
      delay: options?.delay,
    });
  };
}

// Factory function to create a worker for a queue
export function createWorker(
  queueName: string,
  processor: (job: Job) => Promise<void>,
  redisUrl: string,
  options?: { concurrency?: number }
): Worker {
  const connectionOptions = createConnectionOptions(redisUrl);
  return new Worker(queueName, processor, {
    connection: connectionOptions,
    concurrency: options?.concurrency ?? 5,
  });
}

// Legacy exports for backward compatibility during migration
const connectionOptions = createConnectionOptions(config.REDIS_URL);

// Separate Redis instance for non-queue operations (locking)
export const redis = new IORedis.default(config.REDIS_URL);

// Create queues
export const executeQueue = new Queue(QUEUE_EXECUTE, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const aiQueue = new Queue(QUEUE_AI, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Helper to enqueue a job (legacy)
export async function enqueue(
  queue: 'execute' | 'ai',
  message: QueueMessage,
  options?: { delay?: number }
): Promise<Job> {
  const q = queue === 'execute' ? executeQueue : aiQueue;
  return q.add(message.type, message, {
    delay: options?.delay,
  });
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await executeQueue.close();
  await aiQueue.close();
  await redis.quit();
}
