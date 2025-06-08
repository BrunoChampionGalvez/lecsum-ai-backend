import {
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../entities/course.entity';
import { File } from 'src/entities/file.entity';
import { Folder } from '../../entities/folder.entity'; // Ensure Folder is imported
import { FoldersService } from '../folders/folders.service';
import { FilesService } from '../files/files.service'; // Keep the import for type usage

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepository: Repository<Course>,
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
        private moduleRef: ModuleRef, // Inject ModuleRef
    @Inject(forwardRef(() => FoldersService))
    private foldersService: FoldersService,
  ) {} 

  async findAll(userId: string): Promise<Course[]> {
    return this.coursesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Course> {
    const course = await this.coursesRepository.findOne({
      where: { id, userId },
      relations: ['quizzes', 'flashcards', 'folders'], // 'files' relation removed from initial load
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }


    // Manually fetch file metadata using the optimized FilesService method, lazy-resolved
    if (course) { // Ensure course exists before trying to attach files
      const filesService = await this.moduleRef.get(FilesService, { strict: false });
      const fileMetadata = await filesService.findAllByCourse(id, userId);
      course.files = fileMetadata;
    }

    return course;
  }

  async findAllContentOfOne(
    id: string,
    userId: string,
  ): Promise<
    {
      id: string;
      name: string;
      content: string;
      type: string;
      originalName: string;
    }[]
  > {
    const course = await this.findOne(id, userId);
    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    let files: File[] = [];
    for (const folder of course.folders) {
      const folderFiles = await this.foldersService.findAllFilesRecursively(
        folder.id,
        userId,
      );
      files = [...files, ...folderFiles];
    }
    return files.map((file) => {
      return {
        id: file.id,
        name: file.name,
        content: file.content,
        type: file.type,
        originalName: file.originalName,
      };
    });
  }

  async create(
    courseData: { name: string; description?: string },
    userId: string,
  ): Promise<Course> {
    const course = this.coursesRepository.create({
      ...courseData,
      userId,
    });

    return this.coursesRepository.save(course);
  }

  async update(
    id: string,
    courseData: { name?: string; description?: string },
    userId: string,
  ): Promise<Course> {
    const course = await this.findOne(id, userId);

    // Update course properties
    if (courseData.name) course.name = courseData.name;
    if (courseData.description !== undefined)
      course.description = courseData.description;

    return this.coursesRepository.save(course);
  }

  async delete(id: string, userId: string): Promise<void> {
    const course = await this.findOne(id, userId);

    // First delete all flashcards associated with this course to avoid foreign key constraint violation
    await this.coursesRepository.manager.query(
      'DELETE FROM flashcards WHERE "courseId" = $1',
      [id],
    );

    // Then remove the course
    await this.coursesRepository.remove(course);
  }

  async countUserCourses(userId: string): Promise<number> {
    return this.coursesRepository.count({ where: { userId } });
  }

  /**
   * Private method to check if a course exists and belongs to the user.
   * This method does NOT fetch relations or call other services to avoid circular dependencies.
   */
  private async _checkCourseAccess(id: string, userId: string): Promise<void> {
    const courseExists = await this.coursesRepository.findOne({
      where: { id, userId },
      select: ['id'], // Only select 'id' for existence check
    });
    if (!courseExists) {
      throw new NotFoundException(
        `Course with ID ${id} not found or user does not have access.`,
      );
    }
  }
}
