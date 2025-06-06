import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from './course.entity.js';
import { ChatSession } from './chat-session.entity.js';
import { Quiz } from './quiz.entity.js';
import { Deck } from './deck.entity.js';
import { UserSubscription } from './user-subscription.entity.js';
import { SubscriptionUsage } from './subscription-usage.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Course, (course) => course.user)
  courses: Course[];

  @OneToMany(() => Quiz, (quiz) => quiz.user)
  quizzes: Quiz[];

  @OneToMany(() => Deck, (deck) => deck.user)
  decks: Deck[];

  @OneToMany(() => ChatSession, (chatSession) => chatSession.user)
  chatSessions: ChatSession[];

  @OneToMany(() => UserSubscription, (subscription) => subscription.user)
  subscriptions: UserSubscription[];

  @OneToMany(() => SubscriptionUsage, (usage) => usage.user)
  usageStats: SubscriptionUsage[];
}
