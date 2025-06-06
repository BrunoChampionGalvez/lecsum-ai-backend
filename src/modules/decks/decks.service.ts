import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Deck } from '../../entities/deck.entity';
import { Flashcard } from '../../entities/flashcard.entity';
import { CoursesService } from '../courses/courses.service';

@Injectable()
export class DecksService {
  constructor(
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(Flashcard)
    private flashcardsRepository: Repository<Flashcard>,
    private coursesService: CoursesService,
  ) {}

  async findAll(): Promise<Deck[]> {
    return this.decksRepository.find();
  }

  async findAllByUser(userId: string): Promise<Deck[]> {
    // Get all courses for this user
    const courses = await this.coursesService.findAll(userId);
    const courseIds = courses.map((course) => course.id);

    // Get all decks across all of the user's courses
    return this.decksRepository.find({
      where: { courseId: In(courseIds) },
      relations: ['course'],
      order: { id: 'DESC' }, // Sort by ID as a fallback if createdAt is not available
    });
  }

  async findOne(id: string): Promise<Deck> {
    const deck = await this.decksRepository.findOne({
      where: { id },
    });

    if (!deck) {
      throw new NotFoundException(`Deck with ID ${id} not found`);
    }

    return deck;
  }

  async findMany(ids: string[], userId: string): Promise<Deck[]> {
    return this.decksRepository.find({
      where: { id: In(ids), course: { userId } },
    });
  }

  async create(userId: string, deckData: Partial<Deck>): Promise<Deck> {
    const deck = this.decksRepository.create({
      ...deckData,
      userId,
    });
    return this.decksRepository.save(deck);
  }

  async update(id: string, deckData: Partial<Deck>): Promise<Deck> {
    const deck = await this.findOne(id);

    // Update only provided fields
    Object.assign(deck, deckData);

    return this.decksRepository.save(deck);
  }

  async remove(id: string): Promise<void> {
    const deck = await this.findOne(id);

    // Set deckId to undefined for all flashcards in this deck
    await this.flashcardsRepository.update(
      { deckId: id },
      { deckId: undefined },
    );

    await this.decksRepository.remove(deck);
  }

  async getDeckWithFlashcards(
    id: string,
  ): Promise<{ deck: Deck; flashcards: Flashcard[] }> {
    const deck = await this.findOne(id);
    const flashcards = await this.flashcardsRepository.find({
      where: { deckId: id },
      order: { createdAt: 'DESC' },
    });

    return { deck, flashcards };
  }

  async getAllDecksWithFlashcards(): Promise<
    { id: string; name: string; description: string; flashcardsCount: number }[]
  > {
    const decks = await this.decksRepository.find();
    const result: {
      id: string;
      name: string;
      description: string;
      flashcardsCount: number;
    }[] = [];

    for (const deck of decks) {
      const flashcardsCount = await this.flashcardsRepository.count({
        where: { deckId: deck.id },
      });

      result.push({
        id: deck.id,
        name: deck.name,
        description: deck.description || '',
        flashcardsCount,
      });
    }

    return result;
  }
}
