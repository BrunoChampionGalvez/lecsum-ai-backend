import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from './course.entity.js';
import { QuizQuestion } from './quiz-question.entity.js';
import { DifficultyLevel } from './flashcard.entity.js';
import { User } from './user.entity.js';

@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: DifficultyLevel, nullable: true })
  difficulty: DifficultyLevel;

  @Column({ type: 'int' })
  questionCount: number;

  @Column({ default: false })
  completed: boolean;

  @Column({ nullable: true, type: 'int' })
  lastScore: number;

  @Column({ nullable: true, type: 'varchar', array: true })
  fileIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  courseId: string;

  @ManyToOne(() => Course, (course) => course.quizzes)
  course: Course;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.quizzes)
  user: User;

  @OneToMany(() => QuizQuestion, (question) => question.quiz)
  questions: QuizQuestion[];

  @Column({ default: false })
  aiGenerated: boolean;
}
