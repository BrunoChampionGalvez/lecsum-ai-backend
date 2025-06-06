import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DecksService } from './decks.service';
import { Deck } from '../../entities/deck.entity';

@Controller('decks')
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Get()
  async findAll(@Request() req): Promise<any[]> {
    return this.decksService.findAllByUser(req.user.id);
  }
  
  @Get('with-flashcards')
  async getAllWithFlashcards(): Promise<any[]> {
    return this.decksService.getAllDecksWithFlashcards();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Deck> {
    return this.decksService.findOne(id);
  }

  @Get(':id/flashcards')
  async getDeckWithFlashcards(@Param('id') id: string): Promise<any> {
    return this.decksService.getDeckWithFlashcards(id);
  }

  @Post()
  async create(@Body() createDeckDto: Partial<Deck>, @Request() req): Promise<Deck> {
    return this.decksService.create(req.user.id, createDeckDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDeckDto: Partial<Deck>,
  ): Promise<Deck> {
    return this.decksService.update(id, updateDeckDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.decksService.remove(id);
  }
}
