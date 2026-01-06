import { type Job } from 'bullmq';
import { createWorker, QUEUE_AI, closeQueues } from '../../queue/index.js';
import { pool } from '../../storage/db.js';
import { config } from '../../config.js';
import type { QueueMessage } from '../../queue/messages.js';
import { processExecuteStep, type StepHandler } from '../processor.js';
import { aiHandler } from './handler.js';

// Register AI step handler
const handlers = new Map<string, StepHandler>([
  ['ai', aiHandler],
]);

// Process jobs
async function processJob(job: Job): Promise<void> {
  const message = job.data as QueueMessage;

  console.log(`Processing AI job: ${job.name}`, { type: message.type, id: job.id });

  switch (message.type) {
    case 'EXECUTE_STEP':
      await processExecuteStep(job, handlers);
      break;
    default:
      console.warn('Unknown message type for AI worker:', message);
  }
}

// Create the worker with lower concurrency for AI tasks
const worker = createWorker(QUEUE_AI, processJob, config.REDIS_URL, {
  concurrency: 2, // Lower concurrency for AI to avoid overwhelming LM Studio
});

worker.on('completed', (job) => {
  console.log(`AI job completed: ${job.id}`);
});

worker.on('failed', (job, error) => {
  console.error(`AI job failed: ${job?.id}`, error);
});

worker.on('error', (error) => {
  console.error('AI worker error:', error);
});

console.log(`AI worker started, listening on queue: ${QUEUE_AI}`);

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down AI worker...');
  await worker.close();
  await pool.end();
  await closeQueues();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
