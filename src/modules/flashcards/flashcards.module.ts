import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Flashcard } from '../../entities/flashcard.entity';
import { Deck } from '../../entities/deck.entity';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsController } from './flashcards.controller';
import { DeckService } from './deck.service';
import { DeckController } from './deck.controller';
import { CoursesModule } from '../courses/courses.module';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';
import { FoldersModule } from '../folders/folders.module';
import { UsersModule } from '../users/users.module';
import { SubscriptionModule } from '../../subscription/subscription.module';
import { FlashcardUsageInterceptor } from '../../interceptors/flashcard-usage.interceptor';

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
      useClass: FlashcardUsageInterceptor
    },
  ],
  controllers: [FlashcardsController, DeckController],
  exports: [FlashcardsService, DeckService],
})
export class FlashcardsModule {}
