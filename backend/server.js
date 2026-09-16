'use strict';
/**
 * server.js — Application entry point
 * Connects DB + Redis, then starts HTTP server
 */
const app          = require('./src/app');
const config       = require('./src/config/env');
const logger       = require('./src/utils/logger');
const { connectDB }    = require('./src/config/db');
const { connectRedis } = require('./src/config/redis');

async function bootstrap() {
  try {
    // Connect to PostgreSQL
    await connectDB();

    // Connect to Redis
    await connectRedis();

    // Start server
    const server = app.listen(config.PORT, () => {
      logger.info(`🏨 HotelVerify API running on port ${config.PORT} [${config.NODE_ENV}]`);
      logger.info(`   → http://localhost:${config.PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

bootstrap();
