/**
 * Fastify server entry point.
 * Configures and starts the API server.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import publicRoutes from './routes/public.js';

/**
 * Create and configure Fastify server instance.
 */
const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    // Redact sensitive fields from logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },
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
  // Environment-driven CORS origins
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Add default localhost origins in development
  if (env.NODE_ENV !== 'production') {
    corsOrigins.push(
      'http://localhost:5173', // Vite dev
      'http://localhost:5174', // Vite alt port
      'http://localhost:3000', // Alternative dev
      'http://localhost:4173'  // Vite preview
    );
  }

  // Configure CORS for frontend access
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, postman)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,  // Allow cookies (for future auth)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  fastify.log.info(`CORS configured for origins: ${corsOrigins.join(', ')}`);

  // Configure rate limiting for public endpoints
  // Note: global=false means we only apply to routes that explicitly enable it
  // /health and admin routes are automatically exempt
  await fastify.register(rateLimit, {
    global: false,  // We'll apply to specific routes (public API only)
    max: 100,       // 100 requests
    timeWindow: '1 minute',
    cache: 10000,   // Cache up to 10k clients
    allowList: ['127.0.0.1'],  // Allow localhost unlimited
    skipOnError: true,  // Don't fail on rate limiter errors
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });

  fastify.log.info('Rate limiting configured (public API only, /health exempt)');

  // Security headers (Helmet)
  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow CORS
  });

  fastify.log.info('Security headers (Helmet) configured');

  // ETag support for 304 Not Modified responses
  await fastify.register(import('@fastify/etag'));

  fastify.log.info('ETag support enabled for conditional requests');

  // Sensible plugin for error helpers
  await fastify.register(import('@fastify/sensible'));

  fastify.log.info('Sensible plugin registered (error helpers)');

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

  // Register public API routes (read-only, no auth)
  await fastify.register(publicRoutes, { prefix: '/api/public' });

  fastify.log.info('All routes registered successfully');

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
