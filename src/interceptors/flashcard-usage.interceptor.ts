import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsageTrackingService } from '../services/usage-tracking.service.js';
import { Request } from 'express';

interface UserPayload {
  id: string;
}

interface GenerateFlashcardsResponse {
  id: string; // Assuming this is the deckId
}
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flashcard } from '../entities/flashcard.entity.js';
import { Deck } from '../entities/deck.entity.js';

@Injectable()
export class FlashcardUsageInterceptor implements NestInterceptor {
  constructor(
    private readonly usageTrackingService: UsageTrackingService,
    @InjectRepository(Flashcard)
    private flashcardRepository: Repository<Flashcard>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: UserPayload }>();

    // Ensure user exists and has an ID
    if (!request.user || !request.user.id) {
      throw new HttpException(
        'Unauthorized - User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = request.user.id; // User ID from JWT

    // Only intercept POST requests for generating flashcards
    if (
      request.method === 'POST' &&
      request.url.includes('/flashcards/generate')
    ) {
      // Check if user can create more flashcards
      const canUseFlashcards = await this.usageTrackingService.canUseFeature(
        userId,
        'flashcard',
      );

      if (!canUseFlashcards) {
        throw new HttpException(
          'You have reached your flashcard generation limit for this billing period.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Proceed with the request and handle the response
      return next.handle().pipe(
        tap((response: GenerateFlashcardsResponse) => {
          void (async () => {
            // The response should contain the created deck and its flashcards
            if (response && response.id) {
              try {
                // Count the number of flashcards created
                const flashcardsCount = await this.flashcardRepository.count({
                  where: { deckId: response.id },
                });

                if (flashcardsCount > 0) {
                  // Track the flashcards usage
                  await this.usageTrackingService.trackFlashcards(
                    userId,
                    flashcardsCount,
                  );
                  console.log(
                    `Tracked ${flashcardsCount} flashcards for user ${userId}`,
                  );
                }
              } catch (error: unknown) {
                const prefix = 'Failed to track flashcard usage';
                if (error instanceof Error) {
                  console.error(`${prefix}: ${error.message}`);
                } else if (typeof error === 'string') {
                  console.error(`${prefix}: ${error}`);
                } else if (
                  error &&
                  typeof (error as { message?: unknown }).message === 'string'
                ) {
                  console.error(
                    `${prefix}: ${(error as { message: string }).message}`,
                  );
                } else {
                  console.error(
                    `${prefix}: An unexpected error object was caught. Original error:`,
                    error,
                  );
                }
              }
            }
          })();
        }),
      );
    }

    return next.handle();
  }
}
