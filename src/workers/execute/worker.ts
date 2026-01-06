import { type Job } from 'bullmq';
import { createWorker, QUEUE_EXECUTE, closeQueues } from '../../queue/index.js';
import { pool } from '../../storage/db.js';
import { config } from '../../config.js';
import type { QueueMessage } from '../../queue/messages.js';
import { processStartRun, processExecuteStep, type StepHandler } from '../processor.js';
import { httpHandler } from './http.js';
import { transformHandler } from './transform.js';
import { delayHandler } from './delay.js';

// Register step handlers
const handlers = new Map<string, StepHandler>([
  ['http', httpHandler],
  ['transform', transformHandler],
  ['delay', delayHandler],
]);

// Process jobs
async function processJob(job: Job): Promise<void> {
  const message = job.data as QueueMessage;

  console.log(`Processing job: ${job.name}`, { type: message.type, id: job.id });

  switch (message.type) {
    case 'START_RUN':
      await processStartRun(message.runId, message.workflowId, handlers);
      break;
    case 'EXECUTE_STEP':
      await processExecuteStep(job, handlers);
      break;
    case 'COMPLETE_RUN':
      // Handled by processor, nothing to do here
      break;
    default:
      console.warn('Unknown message type:', message);
  }
}

// Create the worker
const worker = createWorker(QUEUE_EXECUTE, processJob, config.REDIS_URL, {
  concurrency: 5,
});

worker.on('completed', (job) => {
  console.log(`Job completed: ${job.id}`);
});

worker.on('failed', (job, error) => {
  console.error(`Job failed: ${job?.id}`, error);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

console.log(`Execute worker started, listening on queue: ${QUEUE_EXECUTE}`);

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down execute worker...');
  await worker.close();
  await pool.end();
  await closeQueues();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
