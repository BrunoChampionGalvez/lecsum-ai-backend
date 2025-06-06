import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../entities/course.entity.js';
import { CoursesService } from './courses.service.js';
import { CoursesController } from './courses.controller.js';
import { FoldersModule } from '../folders/folders.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course]),
    forwardRef(() => FoldersModule),
  ],
  providers: [CoursesService],
  controllers: [CoursesController],
  exports: [CoursesService],
})
export class CoursesModule {}
