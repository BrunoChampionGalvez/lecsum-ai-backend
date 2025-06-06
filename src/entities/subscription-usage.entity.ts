import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('subscription_usage')
export class SubscriptionUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, user => user.usageStats)
  user: User;

  @Column({ default: 0 })
  liteMessagesUsed: number;

  @Column({ default: 0 })
  thinkMessagesUsed: number;

  @Column({ default: 0 })
  flashcardsGenerated: number;

  @Column({ default: 0 })
  quizQuestionsGenerated: number;

  // Reset date for the current usage period
  @Column({ nullable: true })
  lastResetDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
