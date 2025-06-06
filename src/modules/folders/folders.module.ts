import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';
import { Folder } from '../../entities/folder.entity.js';
import { File } from '../../entities/file.entity.js';
import { CoursesModule } from '../courses/courses.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Folder, File]),
    forwardRef(() => CoursesModule),
  ],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
