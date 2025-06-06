import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Quiz } from '../../entities/quiz.entity.js';
import { QuizQuestion } from '../../entities/quiz-question.entity.js';
import { QuizzesService } from './quizzes.service.js';
import { QuizzesController } from './quizzes.controller.js';
import { CoursesModule } from '../courses/courses.module.js';
import { FilesModule } from '../files/files.module.js';
import { AiModule } from '../ai/ai.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { UsersModule } from '../users/users.module.js';
import { SubscriptionModule } from '../../subscription/subscription.module.js';
import { QuizUsageInterceptor } from '../../interceptors/quiz-usage.interceptor.js';

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
