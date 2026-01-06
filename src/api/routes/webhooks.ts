import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import type { TriggerData } from '../../domain/entities/run.js';
import type { StartRunMessage } from '../../queue/messages.js';

interface WebhookParams {
  slug: string;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Webhook trigger endpoint
  app.post<{ Params: WebhookParams }>(
    '/webhooks/:slug',
    async (request: FastifyRequest<{ Params: WebhookParams }>, reply: FastifyReply) => {
      const { slug } = request.params;

      // Get dependencies from DI scope
      const { workflowRepository, runRepository, enqueue } = request.diScope.cradle;

      // Find the workflow by slug
      const workflow = await workflowRepository.findBySlug(slug);

      if (!workflow) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Workflow '${slug}' not found`,
        });
      }

      if (!workflow.enabled) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Workflow is disabled',
        });
      }

      // Verify webhook secret if configured
      if (workflow.webhookSecret) {
        const signature = request.headers['x-webhook-signature'] as string | undefined;
        if (!signature) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Missing webhook signature',
          });
        }

        const bodyString = JSON.stringify(request.body);
        const expectedSignature = crypto
          .createHmac('sha256', workflow.webhookSecret)
          .update(bodyString)
          .digest('hex');

        if (signature !== `sha256=${expectedSignature}`) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid webhook signature',
          });
        }
      }

      // Check idempotency key
      const idempotencyKey = request.headers['x-idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const existingRun = await runRepository.findByIdempotencyKey(idempotencyKey);
        if (existingRun) {
          return reply.status(200).send({
            runId: existingRun.id,
            status: existingRun.status,
            message: 'Duplicate request - returning existing run',
          });
        }
      }

      // Build trigger data
      const triggerData: TriggerData = {
        headers: request.headers as Record<string, string>,
        body: request.body,
        query: request.query as Record<string, string>,
        method: request.method,
        receivedAt: new Date(),
        sourceIp: request.ip,
      };

      // Create the run
      const run = await runRepository.create(workflow.id, triggerData);

      // Store idempotency key if provided
      if (idempotencyKey) {
        await runRepository.setIdempotencyKey(idempotencyKey, run.id);
      }

      // Enqueue the run for processing
      const message: StartRunMessage = {
        type: 'START_RUN',
        runId: run.id,
        workflowId: workflow.id,
      };
      await enqueue('execute', message);

      return reply.status(202).send({
        runId: run.id,
        status: run.status,
        workflowId: workflow.id,
      });
    }
  );
}
