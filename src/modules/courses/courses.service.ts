import {
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../entities/course.entity';
import { File } from 'src/entities/file.entity';
import { FoldersService } from '../folders/folders.service';
// import { FilesService } from '../files/files.service';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepository: Repository<Course>,
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
      relations: ['files', 'quizzes', 'flashcards', 'folders'],
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
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
}
