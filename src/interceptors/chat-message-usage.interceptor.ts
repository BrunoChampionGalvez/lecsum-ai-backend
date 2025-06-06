import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UsageTrackingService } from '../services/usage-tracking.service.js';
import { Request } from 'express';

interface UserPayload {
  id: string;
}

interface ChatMessageRequestBody {
  thinkMode?: boolean;
}

@Injectable()
export class ChatMessageUsageInterceptor implements NestInterceptor {
  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: UserPayload; body: ChatMessageRequestBody }
      >();

    // Ensure user exists and has an ID
    if (!request.user || !request.user.id) {
      throw new HttpException(
        'Unauthorized - User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = request.user.id; // User ID from JWT

    // Check if this is a chat message endpoint
    if (
      request.method === 'POST' &&
      request.url.match(/\/chat\/sessions\/[^/]+\/messages/)
    ) {
      // Safely access thinkMode, defaulting to false if body or thinkMode is not present
      const thinkMode = !!(request.body as ChatMessageRequestBody)?.thinkMode;

      // Check if user can use the requested message type
      const canUseFeature = await this.usageTrackingService.canUseFeature(
        userId,
        thinkMode ? 'thinkMessage' : 'liteMessage',
      );

      if (!canUseFeature) {
        throw new HttpException(
          `You have reached your ${thinkMode ? 'Think' : 'Lite'} message limit for this billing period.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Store the request body for post-processing
      const response = next.handle();

      // We need to track usage after the response has started but we don't want to block
      setTimeout(() => {
        void (async () => {
          try {
            const usageType = thinkMode ? 'thinkMessagesUsed' : 'liteMessagesUsed';
              await this.usageTrackingService.trackUsage(userId, usageType);
          } catch (err: unknown) {
            const prefix = 'Failed to track message usage';
            if (err instanceof Error) {
              console.error(`${prefix}: ${err.message}`);
            } else if (typeof err === 'string') {
              console.error(`${prefix}: ${err}`);
            } else if (
              err &&
              typeof (err as { message?: unknown }).message === 'string'
            ) {
              console.error(
                `${prefix}: ${(err as { message: string }).message}`,
              );
            } else {
              console.error(
                `${prefix}: An unexpected error object was caught. Original error:`,
                err,
              );
            }
          }
        })();
      }, 0);

      return response;
    }

    return next.handle();
  }
}
