import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Add global logging middleware
  const logger = new Logger('HTTP');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const { ip, method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Log the incoming request
    logger.log(`Request: ${method} ${originalUrl} - ${userAgent} ${ip}`);

    // Log the response when it's finished
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const responseTime = Date.now() - startTime;

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

  await app.listen(process.env.PORT ?? 3001);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap().catch((error) => {
  // Use console.error here as NestJS Logger might not be initialized if bootstrap fails early
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});
