import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ChatSession } from '../../entities/chat-session.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';
import { DecksModule } from '../decks/decks.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { FoldersModule } from '../folders/folders.module';
import { CoursesModule } from '../courses/courses.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { ChatMessageUsageInterceptor } from '../../interceptors/chat-message-usage.interceptor';

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
