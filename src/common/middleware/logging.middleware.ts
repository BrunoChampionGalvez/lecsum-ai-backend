import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Log the incoming request
    this.logger.log(
      `Request: ${method} ${originalUrl} - ${userAgent} ${ip}`
    );

    // Log the response when it's finished
    response.on('finish', () => {
      const { statusCode } = response;
      const contentLength = response.get('content-length');
      const responseTime = Date.now() - startTime;

      this.logger.log(
        `Response: ${method} ${originalUrl} ${statusCode} ${contentLength || 0}b - ${responseTime}ms`
      );
    });

    next();
  }
}
