import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyAuth } from '../middleware/auth.js';
import type { RunStatus } from '../../domain/entities/run.js';
import type { StartRunMessage } from '../../queue/messages.js';

interface IdParams {
  id: string;
}

export async function runRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth to all routes
  app.addHook('preHandler', apiKeyAuth);

  // List runs
  app.get('/api/v1/runs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { runRepository } = request.diScope.cradle;

    const query = request.query as Record<string, string>;
    const runs = await runRepository.list({
      workflowId: query['workflowId'],
      status: query['status'] as RunStatus | undefined,
      limit: query['limit'] ? parseInt(query['limit'], 10) : undefined,
      offset: query['offset'] ? parseInt(query['offset'], 10) : undefined,
    });
    return reply.send({ runs });
  });

  // Get run by ID
  app.get<{ Params: IdParams }>(
    '/api/v1/runs/:id',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { runRepository } = request.diScope.cradle;

      const run = await runRepository.findById(request.params.id);
      if (!run) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Run not found',
        });
      }
      return reply.send(run);
    }
  );

  // Get step executions for a run
  app.get<{ Params: IdParams }>(
    '/api/v1/runs/:id/executions',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { runRepository } = request.diScope.cradle;

      const run = await runRepository.findById(request.params.id);
      if (!run) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Run not found',
        });
      }

      const executions = await runRepository.getStepExecutions(request.params.id);
      return reply.send({ executions });
    }
  );

  // Cancel a run
  app.post<{ Params: IdParams }>(
    '/api/v1/runs/:id/cancel',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { runRepository } = request.diScope.cradle;

      const run = await runRepository.findById(request.params.id);
      if (!run) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Run not found',
        });
      }

      if (run.status !== 'pending' && run.status !== 'running') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Cannot cancel run with status '${run.status}'`,
        });
      }

      const updated = await runRepository.updateStatus(request.params.id, 'cancelled', {
        completedAt: new Date(),
      });
      return reply.send(updated);
    }
  );

  // Retry a failed run
  app.post<{ Params: IdParams }>(
    '/api/v1/runs/:id/retry',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { runRepository, workflowRepository, enqueue } = request.diScope.cradle;

      const run = await runRepository.findById(request.params.id);
      if (!run) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Run not found',
        });
      }

      if (run.status !== 'failed') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Can only retry failed runs, current status is '${run.status}'`,
        });
      }

      // Check workflow still exists
      const workflow = await workflowRepository.findById(run.workflowId);
      if (!workflow) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Workflow no longer exists',
        });
      }

      // Reset run status to pending
      const updated = await runRepository.updateStatus(request.params.id, 'pending', {
        completedAt: undefined,
        error: undefined,
      });

      // Re-enqueue the run
      const message: StartRunMessage = {
        type: 'START_RUN',
        runId: run.id,
        workflowId: run.workflowId,
      };
      await enqueue('execute', message);

      return reply.send(updated);
    }
  );
}
