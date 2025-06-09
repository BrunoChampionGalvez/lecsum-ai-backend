import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { File } from '../../entities/file.entity';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { CoursesModule } from '../courses/courses.module';
import { AiModule } from '../ai/ai.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, callback) => {
        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ];
        if (allowedTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new Error('Only PDF, DOCX, and plain text files are allowed'),
            false,
          );
        }
      },
    }),
    forwardRef(() => CoursesModule),
    AiModule,
    ConfigModule,
  ],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
