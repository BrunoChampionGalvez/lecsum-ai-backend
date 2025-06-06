import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Course } from './course.entity';
import { Folder } from './folder.entity';

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
  TEXT = 'text'
}

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: FileType })
  type: FileType;

  @Column({ nullable: true })
  path: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ default: false })
  processed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  courseId: string;

  @ManyToOne(() => Course, course => course.files)
  course: Course;
  
  @Column({ nullable: true })
  folderId: string;
  
  @ManyToOne(() => Folder, folder => folder.files, { nullable: true })
  folder: Folder;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'text', array: true })
  chunks: string[];

  @Column()
  originalName: string;
}
