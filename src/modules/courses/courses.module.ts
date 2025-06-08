import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../entities/course.entity';
import { Folder } from '../../entities/folder.entity';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Folder]),
    forwardRef(() => FoldersModule),
    forwardRef(() => FilesModule),
  ],
  providers: [CoursesService],
  controllers: [CoursesController],
  exports: [CoursesService],
})
export class CoursesModule {}
