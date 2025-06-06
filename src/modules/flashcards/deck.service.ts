import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deck } from '../../entities/deck.entity';

@Injectable()
export class DeckService {
  constructor(
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
  ) {}

  async findAll(): Promise<Deck[]> {
    return this.deckRepository.find({ relations: ['course', 'flashcards'] });
  }

  async findOne(id: string): Promise<Deck> {
    // Include flashcards in the relation
    const deck = await this.deckRepository.findOne({ where: { id }, relations: ['course', 'flashcards'] });
    if (!deck) throw new NotFoundException(`Deck with id ${id} not found`);
    return deck;
  }

  async getFlashcards(deckId: string) {
    const deck = await this.deckRepository.findOne({ where: { id: deckId }, relations: ['flashcards'] });
    if (!deck) throw new NotFoundException(`Deck with id ${deckId} not found`);
    return deck.flashcards;
  }

  async create(userId: string, data: Partial<Deck>): Promise<Deck> {
    const deck = this.deckRepository.create({
      ...data,
      userId,
    });
    return this.deckRepository.save(deck);
  }

  async update(id: string, data: Partial<Deck>): Promise<Deck> {
    await this.deckRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.deckRepository.delete(id);
  }
}
