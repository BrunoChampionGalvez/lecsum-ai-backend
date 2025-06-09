import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Add global logging middleware
  const logger = new Logger('HTTP');
  const authLogger = new Logger('AUTH-DEBUG');

  // Add raw request body logging middleware to debug auth issues
  app.use(express.json({ verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }}))

  // Add detailed debug middleware BEFORE any other middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const { ip, method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Special detailed logging for auth endpoints
    if (originalUrl.includes('/auth')) {
      authLogger.log(`AUTH REQUEST: ${method} ${originalUrl}`);
      authLogger.log(`Headers: ${JSON.stringify(req.headers)}`);
      
      // Don't log passwords in production, this is just for debugging
      if (req.body) {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) {
          sanitizedBody.password = '[REDACTED]';
        }
        authLogger.log(`Body: ${JSON.stringify(sanitizedBody)}`);
      }
    }

    // Log the incoming request
    logger.log(`Request: ${method} ${originalUrl} - ${userAgent} ${ip}`);

    // Log the response when it's finished
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const responseTime = Date.now() - startTime;

      // Special detailed logging for auth endpoints responses
      if (originalUrl.includes('/auth')) {
        authLogger.log(`AUTH RESPONSE: ${method} ${originalUrl} ${statusCode}`);
        // Don't log the actual response body as it might contain sensitive data
      }

      logger.log(
        `Response: ${method} ${originalUrl} ${statusCode} ${contentLength || 0}b - ${responseTime}ms`,
      );
    });

    next();
  });

  // Enable CORS with frontend URL from environment variable
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  console.log(
    `CORS enabled for ${process.env.FRONTEND_URL || 'http://localhost:3000'}`,
  );

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
  const port = process.env.PORT ?? 3001;
  let appUrl: string;
  if (process.env.ENVIRONMENT === 'production') {
    appUrl = await app.getUrl();
  } else {
    // Default to localhost for development or if ENVIRONMENT is not 'production'
    appUrl = `http://localhost:${port}`;
  }
  console.log(`Application is running on: ${appUrl}`);
}
bootstrap().catch((error) => {
  // Use console.error here as NestJS Logger might not be initialized if bootstrap fails early
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});
