import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CreateWorkflowInput,
  CreateStepInput,
} from '../../domain/entities/workflow.js';
import { apiKeyAuth } from '../middleware/auth.js';

interface IdParams {
  id: string;
}

interface StepParams {
  id: string;
  stepId: string;
}

const UpdateWorkflowInput = z.object({
  name: z.string().min(1).max(200).optional(),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth to all routes
  app.addHook('preHandler', apiKeyAuth);

  // Create workflow
  app.post('/api/v1/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workflowRepository } = request.diScope.cradle;

    const parsed = CreateWorkflowInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: parsed.error.flatten(),
      });
    }

    try {
      const workflow = await workflowRepository.create(parsed.data);
      return reply.status(201).send(workflow);
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'A workflow with this slug already exists',
        });
      }
      throw error;
    }
  });

  // List workflows
  app.get('/api/v1/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workflowRepository } = request.diScope.cradle;

    const query = request.query as Record<string, string>;
    const workflows = await workflowRepository.list({
      enabled: query['enabled'] === 'true' ? true : query['enabled'] === 'false' ? false : undefined,
      limit: query['limit'] ? parseInt(query['limit'], 10) : undefined,
      offset: query['offset'] ? parseInt(query['offset'], 10) : undefined,
    });
    return reply.send({ workflows });
  });

  // Get workflow by ID
  app.get<{ Params: IdParams }>(
    '/api/v1/workflows/:id',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const workflow = await workflowRepository.findById(request.params.id);
      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
        });
      }
      return reply.send(workflow);
    }
  );

  // Update workflow
  app.patch<{ Params: IdParams }>(
    '/api/v1/workflows/:id',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const parsed = UpdateWorkflowInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: parsed.error.flatten(),
        });
      }

      const workflow = await workflowRepository.update(request.params.id, parsed.data);
      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
        });
      }
      return reply.send(workflow);
    }
  );

  // Delete workflow
  app.delete<{ Params: IdParams }>(
    '/api/v1/workflows/:id',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const deleted = await workflowRepository.delete(request.params.id);
      if (!deleted) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
        });
      }
      return reply.status(204).send();
    }
  );

  // Add step to workflow
  app.post<{ Params: IdParams }>(
    '/api/v1/workflows/:id/steps',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const parsed = CreateStepInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: parsed.error.flatten(),
        });
      }

      // Check workflow exists
      const workflow = await workflowRepository.findById(request.params.id);
      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Workflow not found',
        });
      }

      try {
        const step = await workflowRepository.addStep(request.params.id, parsed.data);
        return reply.status(201).send(step);
      } catch (error) {
        if (error instanceof Error && error.message.includes('unique')) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'A step with this name already exists in the workflow',
          });
        }
        throw error;
      }
    }
  );

  // Update step
  app.patch<{ Params: StepParams }>(
    '/api/v1/workflows/:id/steps/:stepId',
    async (request: FastifyRequest<{ Params: StepParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const step = await workflowRepository.updateStep(request.params.stepId, request.body as Record<string, unknown>);
      if (!step) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Step not found',
        });
      }
      return reply.send(step);
    }
  );

  // Delete step
  app.delete<{ Params: StepParams }>(
    '/api/v1/workflows/:id/steps/:stepId',
    async (request: FastifyRequest<{ Params: StepParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const deleted = await workflowRepository.deleteStep(request.params.stepId);
      if (!deleted) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Step not found',
        });
      }
      return reply.status(204).send();
    }
  );

  // Reorder steps
  app.post<{ Params: IdParams }>(
    '/api/v1/workflows/:id/steps/reorder',
    async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const { workflowRepository } = request.diScope.cradle;

      const body = request.body as { stepIds?: string[] };
      if (!body.stepIds || !Array.isArray(body.stepIds)) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'stepIds array is required',
        });
      }

      await workflowRepository.reorderSteps(request.params.id, body.stepIds);
      const workflow = await workflowRepository.findById(request.params.id);
      return reply.send(workflow);
    }
  );
}
