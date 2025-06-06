import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { UserSubscription } from './user-subscription.entity';

export enum SubscriptionPlanType {
  FREE_TRIAL = 'free_trial',
  STARTER = 'starter',
  PRO = 'pro'
}

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlanType,
    unique: true
  })
  type: SubscriptionPlanType;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  liteMessageLimit: number;

  @Column()
  thinkMessageLimit: number;

  @Column()
  flashcardsLimit: number;

  @Column()
  quizQuestionsLimit: number;

  @Column({ type: 'int', nullable: true })
  trialDurationDays: number;

  @Column({ default: true })
  isActive: boolean;
  
  @OneToMany(() => UserSubscription, subscription => subscription.plan)
  subscriptions: UserSubscription[];
}
