import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Quiz } from '../../entities/quiz.entity';
import { QuizQuestion } from '../../entities/quiz-question.entity';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { CoursesModule } from '../courses/courses.module';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';
import { FoldersModule } from '../folders/folders.module';
import { UsersModule } from '../users/users.module';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { QuizUsageInterceptor } from '../../interceptors/quiz-usage.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quiz, QuizQuestion]),
    CoursesModule,
    FilesModule,
    AiModule,
    FoldersModule,
    UsersModule,
    SubscriptionModule,
  ],
  providers: [
    QuizzesService,
    {
      provide: APP_INTERCEPTOR,
      useClass: QuizUsageInterceptor,
    },
  ],
  controllers: [QuizzesController],
  exports: [QuizzesService],
})
export class QuizzesModule {}
