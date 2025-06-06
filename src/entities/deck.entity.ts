import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { Flashcard } from './flashcard.entity.js';
import { Course } from './course.entity.js';
import { User } from './user.entity.js';

@Entity()
export class Deck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Flashcard, (flashcard) => flashcard.deck)
  flashcards: Flashcard[];

  @Column()
  courseId: string;

  @ManyToOne(() => Course, (course) => course.decks)
  course: Course;

  @Column({ default: false })
  aiGenerated: boolean;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.decks)
  user: User;

  @Column({ type: 'varchar', array: true, default: [] })
  fileIds: string[];
}
