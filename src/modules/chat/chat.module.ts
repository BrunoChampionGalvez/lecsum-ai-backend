import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ChatSession } from '../../entities/chat-session.entity.js';
import { ChatMessage } from '../../entities/chat-message.entity.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { FilesModule } from '../files/files.module.js';
import { AiModule } from '../ai/ai.module.js';
import { DecksModule } from '../decks/decks.module.js';
import { QuizzesModule } from '../quizzes/quizzes.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { FlashcardsModule } from '../flashcards/flashcards.module.js';
import { SubscriptionModule } from '../../subscription/subscription.module.js';
import { ChatMessageUsageInterceptor } from '../../interceptors/chat-message-usage.interceptor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
    FilesModule,
    AiModule,
    DecksModule,
    QuizzesModule,
    FoldersModule,
    forwardRef(() => CoursesModule),
    forwardRef(() => FlashcardsModule),
    SubscriptionModule,
  ],
  providers: [
    ChatService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ChatMessageUsageInterceptor,
    },
  ],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
