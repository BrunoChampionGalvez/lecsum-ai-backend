import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DecksController } from './decks.controller.js';
import { DecksService } from './decks.service.js';
import { Deck } from '../../entities/deck.entity.js';
import { Flashcard } from '../../entities/flashcard.entity.js';
import { CoursesModule } from '../courses/courses.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Deck, Flashcard]), CoursesModule],
  controllers: [DecksController],
  providers: [DecksService],
  exports: [DecksService],
})
export class DecksModule {}
