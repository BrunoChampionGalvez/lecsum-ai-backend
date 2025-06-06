import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Flashcard } from '../../entities/flashcard.entity.js';
import { Deck } from '../../entities/deck.entity.js';
import { FlashcardsService } from './flashcards.service.js';
import { FlashcardsController } from './flashcards.controller.js';
import { DeckService } from './deck.service.js';
import { DeckController } from './deck.controller.js';
import { CoursesModule } from '../courses/courses.module.js';
import { FilesModule } from '../files/files.module.js';
import { AiModule } from '../ai/ai.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { UsersModule } from '../users/users.module.js';
import { SubscriptionModule } from '../../subscription/subscription.module.js';
import { FlashcardUsageInterceptor } from '../../interceptors/flashcard-usage.interceptor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flashcard, Deck]),
    CoursesModule,
    FilesModule,
    AiModule,
    FoldersModule,
    UsersModule,
    SubscriptionModule,
  ],
  providers: [
    FlashcardsService,
    DeckService,
    {
      provide: APP_INTERCEPTOR,
      useClass: FlashcardUsageInterceptor,
    },
  ],
  controllers: [FlashcardsController, DeckController],
  exports: [FlashcardsService, DeckService],
})
export class FlashcardsModule {}
