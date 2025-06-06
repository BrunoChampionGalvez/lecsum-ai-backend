import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';
import { Deck } from './deck.entity.js';
import { File } from './file.entity.js';
import { Folder } from './folder.entity.js';
import { Quiz } from './quiz.entity.js';
import { Flashcard } from './flashcard.entity.js';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ nullable: true, type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.courses)
  user: User;

  @OneToMany(() => File, (file) => file.course)
  files: File[];

  @OneToMany(() => Folder, (folder) => folder.course)
  folders: Folder[];

  @OneToMany(() => Quiz, (quiz) => quiz.course)
  quizzes: Quiz[];

  @OneToMany(() => Flashcard, (flashcard) => flashcard.course)
  flashcards: Flashcard[];

  @OneToMany(() => Deck, (deck) => deck.course)
  decks: Deck[];
}
