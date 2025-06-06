import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Quiz } from './quiz.entity';

@Entity('quiz_questions')
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'jsonb' })
  options: string[];

  @Column()
  correctAnswer: string;

  @Column({ nullable: true })
  userAnswer: string;

  @Column({ default: false })
  isCorrect: boolean;

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

  @Column({ nullable: true })
  quizId: string;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions)
  quiz: Quiz;
}
