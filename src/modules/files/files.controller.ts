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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesService } from './files.service';
import { File, FileType } from '../../entities/file.entity';

interface UserPayload {
  id: string;
}

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async findAll(@Request() req: { user: UserPayload }): Promise<File[]> {
    return this.filesService.findAll(req.user.id);
  }

  @Get('course/:courseId')
  async findAllByCourse(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{ files: File[]; total: number }> {
    return this.filesService.findAllByCourse(courseId, req.user.id, { page, limit });
  }

  @Get('folder/:folderId')
  async findByFolder(
    @Param('folderId') folderId: string,
    @Request() req: { user: UserPayload },
  ): Promise<File[]> {
    return this.filesService.findByFolder(folderId, req.user.id);
  }

  // Folder management moved to FoldersController

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<File> {
    return this.filesService.findOneForChatFlashcardsOrQuizzes(id);
  }

  @Get('id/:id')
  async findOneById(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<File> {
    console.log(`Finding file by ID: ${id} for user: ${req.user.id}`);
    return this.filesService.findOneById(id, req.user.id);
  }

  @Get('content/id/:id')
  async getFileContentById(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<{ content: string; name: string; path: string }> {
    // TODO: Check if user has access to this job, if jobs are user-specific
    console.log(`Getting file content by ID: ${id} for user: ${req.user.id}`);
    // If the provided id param isn't a valid UUID, skip lookup and return fallback
    const idPattern =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!idPattern.test(id)) {
      console.warn(`Invalid ID format in getFileContentById: ${id}`);
      return {
        content: 'This content is no longer available in the course materials.',
        name: 'Deleted File',
        path: 'Deleted File',
      };
    }
    try {
      // Try to find the file
      const file = await this.filesService.findOneById(id, req.user.id);

      // If we get here, the file exists, so get its path
      const path = await this.filesService.getFilePath(file.id, req.user.id);

      console.log(`Found file: ${file.name}, Path: ${path}`);

      return {
        content: file.content || 'Content not available',
        name: file.name,
        path: path,
      };
    } catch (e: unknown) {
      const errorName =
        typeof e === 'object' && e !== null && 'name' in e
          ? String((e as Record<string, unknown>).name)
          : undefined;
      const errorStatus =
        typeof e === 'object' && e !== null && 'status' in e
          ? Number((e as Record<string, unknown>).status)
          : undefined;

      // If it's a NotFoundException, try a direct search by content to find files with similar text
      if (errorName === 'NotFoundException' || errorStatus === 404) {
        console.log(`Searching for file with similar content for ID: ${id}`);
        try {
          // Try to find the file by its content using a direct search
          const matchedFile = await this.filesService.findFileByContent(
            id,
            req.user.id,
          );

          if (matchedFile) {
            console.log(
              `Found file by content match: ${matchedFile.name} with ID: ${matchedFile.id}`,
            );
            const path = await this.filesService.getFilePath(
              matchedFile.id,
              req.user.id,
            );

            return {
              content: matchedFile.content || 'Content not available',
              name: matchedFile.name,
              path: path,
            };
          }
        } catch (contentSearchError: unknown) {
          console.error(`Content search failed for ${id}:`, contentSearchError);
        }

        console.log(`File with ID ${id} not found, returning fallback content`);
        return {
          content:
            'This content is no longer available in the course materials.',
          name: 'Deleted File',
          path: 'Deleted File',
        };
      }

      // For other errors (like unauthorized), just rethrow
      console.error(`Error retrieving file content for ${id}:`, e);
      throw e;
    }
  }

  @Post('upload/pdf/:courseId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folderId?: string | null },
  ): Promise<File> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }

    // Extract folderId from request body if provided
    const folderId = body.folderId || null;
    console.log('PDF Upload with folder ID:', folderId);

    try {
      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.PDF,
        null,
        folderId,
      );
    } catch (e: unknown) {
      console.error('Error extracting PDF content:', e);
      const errorMessage =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as Record<string, unknown>).message)
          : 'Unknown error during PDF content extraction';
      // Continue with upload even if extraction fails
      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.PDF,
        null,
        folderId,
      );
    }
  }

  @Post('upload/docx/:courseId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocx(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folderId?: string | null },
  ): Promise<File> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (
      file.mimetype !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      throw new BadRequestException('Only DOCX files are allowed');
    }

    // Extract folderId from request body if provided
    const folderId = body.folderId || null;
    console.log('DOCX Upload with folder ID:', folderId);

    try {
      // Extract content from DOCX file
      const content = await this.filesService.extractContent(
        file,
        FileType.DOCX,
      );

      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.DOCX,
        content,
        folderId,
      );
    } catch (e: unknown) {
      console.error('Error extracting DOCX content:', e);
      const errorMessage =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as Record<string, unknown>).message)
          : 'Unknown error during DOCX content extraction';
      // Continue with upload even if extraction fails
      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.DOCX,
        null,
        folderId,
      );
    }
  }

  @Post('upload/text/:courseId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadText(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folderId?: string | null },
  ): Promise<File> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (file.mimetype !== 'text/plain') {
      throw new BadRequestException('Only TXT files are allowed');
    }

    // Extract folderId from request body if provided
    const folderId = body.folderId || null;
    console.log('Text Upload with folder ID:', folderId);

    try {
      // Extract content from text file
      const content = await this.filesService.extractContent(
        file,
        FileType.TEXT,
      );

      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.TEXT,
        content,
        folderId,
      );
    } catch (e: unknown) {
      console.error('Error extracting text content:', e);
      const errorMessage =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as Record<string, unknown>).message)
          : 'Unknown error during text content extraction';
      // Continue with upload even if extraction fails
      return this.filesService.uploadFile(
        courseId,
        req.user.id,
        file,
        FileType.TEXT,
        null, // No content extraction for text files
        folderId,
      );
    }
  }

  @Post('text/:courseId')
  async createTextContent(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
    @Body() body: { name: string; content: string; folderId?: string | null },
  ): Promise<File> {
    if (!body.name || !body.content) {
      throw new BadRequestException('Name and content are required');
    }

    // Extract folderId from request body if provided
    const folderId = body.folderId || null;
    console.log('Text Content Creation with folder ID:', folderId);

    return this.filesService.saveTextContent(
      courseId,
      req.user.id,
      body.name,
      body.content,
      folderId,
    );
  }

  /**
   * Save extracted text from PDF.js Express
   */
  @Post(':id/save-text')
  async saveExtractedText(
    @Request() req: { user: UserPayload },
    @Param('id') id: string,
    @Body() textData: { textByPages: string }
  ) {
    try {
      const result = await this.filesService.saveExtractedText(
        id,
        req.user.id, // Fix: using req.user.id instead of req.user.userId
        textData.textByPages
      );
      
      console.log('Backend: Text extraction saved successfully for file:', result.id);
      return {
        success: true,
        paperUpdated: result.id,
        pageCount: Object.keys(textData.textByPages).length
      };
    } catch (error) {
      console.error('Backend: Error saving extracted text:', error);
      throw error;
    }
  }

  @Delete(':id')
  async deleteFile(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<void> {
    return this.filesService.deleteFile(id, req.user.id);
  }

  @Patch(':id/move')
  async moveFile(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
    @Body() body: { folderId: string | null },
  ): Promise<File> {
    return this.filesService.moveFile(id, req.user.id, body.folderId);
  }
}
