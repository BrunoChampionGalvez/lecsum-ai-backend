import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DeckService } from './deck.service.js';
import { Deck } from '../../entities/deck.entity.js';
import { FlashcardsService } from './flashcards.service.js'; // Adjust import if needed
import { Flashcard } from '../../entities/flashcard.entity.js';

interface UserPayload {
  id: string;
}

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DeckController {
  constructor(
    private readonly deckService: DeckService,
    private readonly flashcardsService: FlashcardsService,
  ) {}

  @Get()
  async findAll(): Promise<Deck[]> {
    return this.deckService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Deck> {
    return this.deckService.findOne(id);
  }

  @Post()
  async create(
    @Body() data: Partial<Deck>,
    @Request() req: { user: UserPayload },
  ): Promise<Deck> {
    return this.deckService.create(req.user.id, data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<Deck>,
  ): Promise<Deck> {
    return this.deckService.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.deckService.remove(id);
  }

  // --- FLASHCARDS BY DECK ENDPOINTS ---
  @Get(':deckId/flashcards')
  async getDeckFlashcards(@Param('deckId') deckId: string) {
    return { flashcards: await this.deckService.getFlashcards(deckId) };
  }

  @Post(':deckId/flashcards')
  async addFlashcardToDeck(
    @Param('deckId') deckId: string,
    @Body() flashcardData: Partial<Flashcard>,
    @Request() req: { user: UserPayload },
  ) {
    // Attach deckId to flashcard
    return this.flashcardsService.create(
      { ...flashcardData, deckId },
      req.user.id,
    );
  }

  @Put(':deckId/flashcards/:flashcardId')
  async updateFlashcard(
    @Param('deckId') deckId: string,
    @Param('flashcardId') flashcardId: string,
    @Body() flashcardData: Partial<Flashcard>,
    @Request() req: { user: UserPayload },
  ) {
    // Only allow update if flashcard belongs to deck
    return this.flashcardsService.update(
      flashcardId,
      { ...flashcardData, deckId },
      req.user.id,
    );
  }

  @Delete(':deckId/flashcards/:flashcardId')
  async deleteFlashcard(
    @Param('deckId') deckId: string,
    @Param('flashcardId') flashcardId: string,
    @Request() req: { user: UserPayload },
  ) {
    return this.flashcardsService.deleteFlashcard(flashcardId, req.user.id);
  }
}
