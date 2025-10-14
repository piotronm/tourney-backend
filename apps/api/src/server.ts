/**
 * Fastify server entry point.
 * Configures and starts the API server.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { closeDatabase } from './lib/db/drizzle.js';
import healthRoute from './routes/health.js';
import seedRoute from './routes/seed.js';
import seedDuprRoute from './routes/seedDupr.js';
import exportCsvRoute from './routes/exportCsv.js';
import exportExcelRoute from './routes/exportExcel.js';
import scoreMatchRoute from './routes/scoreMatch.js';
import standingsRoute from './routes/standings.js';
import divisionsRoutes from './routes/divisions.js';

/**
 * Create and configure Fastify server instance.
 */
const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

/**
 * Register plugins and routes.
 */
async function bootstrap() {
  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({
      err: error,
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        body: request.body,
      },
    }, 'Request error occurred');

    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
      ...(env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  });

  // Register routes
  await fastify.register(healthRoute);
  await fastify.register(divisionsRoutes, { prefix: '/api' });
  await fastify.register(seedRoute, { prefix: '/api' });
  await fastify.register(seedDuprRoute, { prefix: '/api' });
  await fastify.register(exportCsvRoute, { prefix: '/api' });
  await fastify.register(exportExcelRoute, { prefix: '/api' });
  await fastify.register(scoreMatchRoute, { prefix: '/api' });
  await fastify.register(standingsRoute, { prefix: '/api' });

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      fastify.log.info(`Received ${signal}, closing server...`);
      void fastify.close().then(() => {
        closeDatabase();
        process.exit(0);
      });
    });
  }

  // Start server
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${env.PORT}`);
    fastify.log.info(`Environment: ${env.NODE_ENV}`);
    fastify.log.info(`Database: ${env.DATABASE_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

void bootstrap();
