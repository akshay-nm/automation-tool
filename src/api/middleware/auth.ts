import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { config } from '../../config.js';

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Skip auth if no API key is configured
  if (!config.API_KEY) {
    done();
    return;
  }

  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== config.API_KEY) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
    });
    return;
  }

  done();
}
