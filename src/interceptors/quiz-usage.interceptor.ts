import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { QuizQuestion } from '../entities/quiz-question.entity';

@Injectable()
export class QuizUsageInterceptor implements NestInterceptor {
  constructor(
    private readonly usageTrackingService: UsageTrackingService,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private quizQuestionRepository: Repository<QuizQuestion>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Ensure user exists and has an ID
    if (!request.user || !request.user['id']) {
      throw new HttpException('Unauthorized - User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    const userId = request.user['id']; // User ID from JWT

    // Only intercept POST requests for generating quizzes
    if (
      request.method === 'POST' && 
      (request.url.includes('/quizzes/generate') || request.url.includes('/quizzes/create'))
    ) {
      // Check if user can create more quiz questions
      const canUseQuizQuestions = await this.usageTrackingService.canUseFeature(userId, 'quizQuestion');
      
      if (!canUseQuizQuestions) {
        throw new HttpException(
          'You have reached your quiz question generation limit for this billing period.',
          HttpStatus.PAYMENT_REQUIRED
        );
      }

      // Proceed with the request and handle the response
      return next.handle().pipe(
        tap(async (response) => {
          // The response should contain the created quiz and its questions
          if (response && response.id) {
            try {
              // Count the number of quiz questions created
              const questionCount = await this.quizQuestionRepository.count({
                where: { quizId: response.id }
              });

              if (questionCount > 0) {
                // Track the quiz questions usage
                await this.usageTrackingService.trackQuizQuestions(userId, questionCount);
                console.log(`Tracked ${questionCount} quiz questions for user ${userId}`);
              }
            } catch (error) {
              console.error('Failed to track quiz question usage:', error);
            }
          }
        })
      );
    }

    return next.handle();
  }
}
