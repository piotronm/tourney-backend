/**
 * Health check endpoint.
 * Returns server status and timestamp.
 */

import type { FastifyPluginAsync } from 'fastify';

// eslint-disable-next-line @typescript-eslint/require-await
const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });
};

export default healthRoute;
