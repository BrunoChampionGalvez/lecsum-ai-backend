import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Tree,
  TreeChildren,
  TreeParent,
} from 'typeorm';
import { Course } from './course.entity';
import { File } from './file.entity';

@Entity('folders')
@Tree('materialized-path')
export class Folder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  courseId: string;

  @ManyToOne(() => Course, (course) => course.folders)
  course: Course;

  @TreeChildren()
  children: Folder[];

  @TreeParent()
  parent: Folder;

  @Column({ nullable: true })
  parentId: string;

  @OneToMany(() => File, (file) => file.folder)
  files: File[];
}
