import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flashcard } from '../entities/flashcard.entity';
import { Deck } from '../entities/deck.entity';

@Injectable()
export class FlashcardUsageInterceptor implements NestInterceptor {
  constructor(
    private readonly usageTrackingService: UsageTrackingService,
    @InjectRepository(Flashcard)
    private flashcardRepository: Repository<Flashcard>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Ensure user exists and has an ID
    if (!request.user || !request.user['id']) {
      throw new HttpException('Unauthorized - User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    const userId = request.user['id']; // User ID from JWT

    // Only intercept POST requests for generating flashcards
    if (
      request.method === 'POST' &&
      request.url.includes('/flashcards/generate') 
    ) {
      // Check if user can create more flashcards
      const canUseFlashcards = await this.usageTrackingService.canUseFeature(userId, 'flashcard');
      
      if (!canUseFlashcards) {
        throw new HttpException(
          'You have reached your flashcard generation limit for this billing period.',
          HttpStatus.PAYMENT_REQUIRED
        );
      }

      // Proceed with the request and handle the response
      return next.handle().pipe(
        tap(async (response) => {
          // The response should contain the created deck and its flashcards
          if (response && response.id) {
            try {
              // Count the number of flashcards created
              const flashcardsCount = await this.flashcardRepository.count({
                where: { deckId: response.id }
              });

              if (flashcardsCount > 0) {
                // Track the flashcards usage
                await this.usageTrackingService.trackFlashcards(userId, flashcardsCount);
                console.log(`Tracked ${flashcardsCount} flashcards for user ${userId}`);
              }
            } catch (error) {
              console.error('Failed to track flashcard usage:', error);
            }
          }
        })
      );
    }

    return next.handle();
  }
}
