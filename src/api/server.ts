import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyAwilixPlugin, diContainer } from '@fastify/awilix';
import { asValue } from 'awilix';
import { config } from '../config.js';
import { webhookRoutes } from './routes/webhooks.js';
import { workflowRoutes } from './routes/workflows.js';
import { runRoutes } from './routes/runs.js';
import { getContainer, disposeContainer } from '../container.js';
import type { WorkflowRepository } from '../storage/repositories/workflow.js';
import type { RunRepository } from '../storage/repositories/run.js';

// Augment the @fastify/awilix Cradle type
declare module '@fastify/awilix' {
  interface Cradle {
    workflowRepository: WorkflowRepository;
    runRepository: RunRepository;
    enqueue: (
      queue: 'execute' | 'ai',
      message: unknown,
      options?: { delay?: number }
    ) => Promise<unknown>;
    config: typeof config;
  }
}

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// Register plugins
await app.register(cors, {
  origin: true,
});

// Register Awilix DI plugin
await app.register(fastifyAwilixPlugin, {
  disposeOnClose: true,
  disposeOnResponse: false, // Keep singletons alive
});

// Get the application container and register dependencies
const container = getContainer();
diContainer.register({
  workflowRepository: asValue(container.cradle.workflowRepository),
  runRepository: asValue(container.cradle.runRepository),
  enqueue: asValue(container.cradle.enqueue),
  config: asValue(container.cradle.config),
});

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register routes
await app.register(webhookRoutes);
await app.register(workflowRoutes);
await app.register(runRoutes);

// Error handler
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);

  const err = error as { validation?: unknown; message?: string };

  if (err.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: err.message ?? 'Validation failed',
      details: err.validation,
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? 'An unexpected error occurred' : (err.message ?? 'Unknown error'),
  });
});

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down...');
  await app.close();
  await disposeContainer();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Server running at http://${config.HOST}:${config.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

export { app };
