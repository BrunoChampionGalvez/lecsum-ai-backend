import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FoldersService } from './folders.service';
import { Folder } from '../../entities/folder.entity';
import { File } from '../../entities/file.entity';
import { CreateFolderDto } from './dto/create-folder.dto';

interface UserPayload {
  id: string;
}

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Get()
  async findAll(@Request() req: { user: UserPayload }): Promise<Folder[]> {
    return this.foldersService.findAll(req.user.id);
  }

  @Get('course/:courseId')
  async findAllByCourse(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
  ): Promise<Folder[]> {
    return this.foldersService.findAllByCourse(courseId, req.user.id);
  }

  @Get(':id/contents')
  async getFolderContents(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<Folder[]> {
    return this.foldersService.findFolderContents(id, req.user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<Folder> {
    return this.foldersService.findOne(id, req.user.id);
  }

  @Post('course/:courseId')
  async createFolder(
    @Param('courseId') courseId: string,
    @Body() createFolderDto: CreateFolderDto,
    @Request() req: { user: UserPayload },
  ): Promise<Folder> {
    return this.foldersService.createFolder(
      courseId,
      req.user.id,
      createFolderDto,
    );
  }

  @Delete(':id')
  async deleteFolder(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<void> {
    return this.foldersService.deleteFolder(id, req.user.id);
  }

  @Patch(':id/move')
  async moveFolder(
    @Param('id') id: string,
    @Body() moveData: { parentId: string | null },
    @Request() req: { user: UserPayload },
  ): Promise<Folder> {
    return this.foldersService.moveFolder(id, req.user.id, moveData.parentId);
  }

  /**
   * Get all files inside a folder recursively (including files in subfolders)
   */
  @Get(':id/files/recursive')
  async getAllFilesRecursively(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<File[]> {
    return this.foldersService.findAllFilesRecursively(id, req.user.id);
  }
}
