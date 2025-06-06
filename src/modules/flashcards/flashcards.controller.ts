import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlashcardsService } from './flashcards.service';
import { Flashcard, FlashcardType, DifficultyLevel } from '../../entities/flashcard.entity';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Get('course/:courseId')
  async findAllByCourse(@Param('courseId') courseId: string, @Request() req): Promise<Flashcard[]> {
    return this.flashcardsService.findAllByCourse(courseId, req.user.id);
  }

  @Get('reference/:id')
  @UseGuards() // Explicitly no guard to allow access without authentication
  async getFlashcardById(@Param('id') id: string): Promise<Flashcard> {
    return this.flashcardsService.getFlashcardById(id);
  }
  
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req): Promise<Flashcard> {
    return this.flashcardsService.findOne(id, req.user.id);
  }

  @Post('generate')
  async generateFlashcards(
    @Body() generateDto: {
      courseId: string;
      fileIds: string[];
      folderIds: string[];
      types: FlashcardType[];
      difficulty: DifficultyLevel;
      flashcardCount: number;
      deckName: string;
    },
    @Request() req,
  ): Promise<Flashcard[]> {
    return this.flashcardsService.generateFlashcards(
      generateDto.courseId,
      req.user.id,
      {
        fileIds: generateDto.fileIds,
        folderIds: generateDto.folderIds,
        types: generateDto.types,
        difficulty: generateDto.difficulty,
        flashcardCount: generateDto.flashcardCount,
        deckName: generateDto.deckName,
      }
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req): Promise<void> {
    return this.flashcardsService.deleteFlashcard(id, req.user.id);
  }

  @Get('deck/:id')
  async findDeckById(@Param('id') id: string, @Request() req): Promise<any> {
    return this.flashcardsService.findDeckById(id, req.user.id);
  }

  @Post('references/batch')
  @HttpCode(200)
  @UseGuards() // Explicitly no guard to allow access without authentication, similar to reference/:id endpoint
  async getFlashcardsByIds(@Body() data: { ids: string[] }): Promise<Record<string, Flashcard>> {
    if (!data || !data.ids || !Array.isArray(data.ids)) {
      return {};
    }
    return this.flashcardsService.findManyById(data.ids);
  }
}
