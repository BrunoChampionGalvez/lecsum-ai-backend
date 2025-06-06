import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { Request } from 'express';

@Injectable()
export class ChatMessageUsageInterceptor implements NestInterceptor {
  constructor(private readonly usageTrackingService: UsageTrackingService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Ensure user exists and has an ID
    if (!request.user || !request.user['id']) {
      throw new HttpException('Unauthorized - User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    const userId = request.user['id']; // User ID from JWT
    
    // Check if this is a chat message endpoint
    if (
      request.method === 'POST' &&
      request.url.match(/\/chat\/sessions\/[^/]+\/messages/)
    ) {
      const body = request.body;
      const thinkMode = body.thinkMode === true;
      
      // Check if user can use the requested message type
      const canUseFeature = await this.usageTrackingService.canUseFeature(
        userId,
        thinkMode ? 'thinkMessage' : 'liteMessage'
      );
      
      if (!canUseFeature) {
        throw new HttpException(
          `You have reached your ${thinkMode ? 'Think' : 'Lite'} message limit for this billing period.`,
          HttpStatus.PAYMENT_REQUIRED
        );
      }
      
      // Store the request body for post-processing
      const response = next.handle();
      
      // We need to track usage after the response has started but we don't want to block
      setTimeout(async () => {
        try {
          if (thinkMode) {
            await this.usageTrackingService.trackThinkMessage(userId);
          } else {
            await this.usageTrackingService.trackLiteMessage(userId);
          }
        } catch (error) {
          console.error('Failed to track message usage:', error);
        }
      }, 0);
      
      return response;
    }
    
    return next.handle();
  }
}
