import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from './course.entity.js';
import { Deck } from './deck.entity.js';

export enum FlashcardType {
  CLOZE = 'cloze',
  QA = 'qa',
}

export enum DifficultyLevel {
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
}

@Entity('flashcards')
export class Flashcard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: FlashcardType })
  type: FlashcardType;

  @Column({ type: 'text' })
  front: string;

  @Column({ type: 'text' })
  back: string;

  @Column({ type: 'enum', enum: DifficultyLevel })
  difficulty: DifficultyLevel;

  @Column({ nullable: true, type: 'jsonb' })
  sourceMaterial: {
    fileId: string;
    excerpt: string;
    location: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  courseId: string;

  @Column({ nullable: true })
  deckId: string;

  @ManyToOne(() => Deck, (deck) => deck.flashcards, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  deck: any;

  @ManyToOne(() => Course, (course) => course.flashcards)
  course: Course;
}
