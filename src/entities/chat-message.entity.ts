import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

export enum MessageRole {
  USER = 'user',
  AI = 'ai',
}

export enum CitationType {
  FILE = 'file',
  FLASHCARD_DECK = 'flashcardDeck',
  QUIZ = 'quiz',
}

export interface FileCitation {
  type: CitationType.FILE;
  id: string;
  text: string;
}

export interface FlashcardDeckCitation {
  type: CitationType.FLASHCARD_DECK;
  id: string;
  flashCardId: string;
}

export interface QuizCitation {
  type: CitationType.QUIZ;
  id: string;
  questionId: string;
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MessageRole })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  citations: (FileCitation | FlashcardDeckCitation | QuizCitation)[];

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  chatSessionId: string;

  @ManyToOne(() => ChatSession, (chatSession) => chatSession.messages)
  chatSession: ChatSession;
}
