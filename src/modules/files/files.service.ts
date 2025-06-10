import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import { promisify } from 'util';
import { File, FileType } from '../../entities/file.entity';
import { Folder } from '../../entities/folder.entity';
import { CoursesService } from '../courses/courses.service';
import { PDFExtract } from 'pdf.js-extract';
import * as mammoth from 'mammoth';
import { AiService } from '../ai/ai.service';
import { Pinecone } from '@pinecone-database/pinecone';
import { ConfigService } from '@nestjs/config';

// Keep readFileAsync for backward compatibility with existing code
const readFileAsync = promisify(fs.readFile);
const pdfExtract = new PDFExtract();

@Injectable()
export class FilesService {
  private pc: Pinecone;

  constructor(
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @Inject(forwardRef(() => CoursesService)) // Add decorator
    private coursesService: CoursesService,
    private aiService: AiService,
    private configService: ConfigService,
  ) {
    this.pc = new Pinecone({
      apiKey: this.configService.get('PINECONE_API_KEY') as string,
    });
  }

  async findAllByCourse(
    courseId: string, 
    _userId: string, 
    options?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{ files: File[]; total: number }> {
    // First verify the course belongs to the user using the lightweight check method
    await (this.coursesService as any)._checkCourseAccess(courseId, _userId);
    
    const page = options?.page || 1;
    const limit = options?.limit || 50; // Default to 50 files per page
    const skip = (page - 1) * limit;
    
    // Get files in the course with pagination
    console.log(`Finding files for course ${courseId} (page: ${page}, limit: ${limit})`);
    
    // Get total count first (separate query to avoid loading all data)
    const total = await this.filesRepository.count({
      where: { courseId }
    });
    
    // Then get the paginated results
    const files = await this.filesRepository.find({
      where: { courseId },
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'type', 'path', 'size', 'processed', 'createdAt', 'updatedAt', 'courseId', 'folderId', 'originalName'],
      skip,
      take: limit
    });

    console.log(`Found ${files.length} files of ${total} total for course ${courseId}`);
    return { files, total };
  }

  async findAll(userId: string): Promise<File[]> {
    // Get all courses for this user
    const courses = await this.coursesService.findAll(userId);
    const courseIds = courses.map((course) => course.id);

    // Get ALL files across all of the user's courses
    return this.filesRepository.find({
      where: { courseId: In(courseIds) },
      relations: ['course'],
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'type', 'path', 'size', 'processed', 'createdAt', 'updatedAt', 'courseId', 'folderId', 'originalName'], // Added select for metadata only
    });
  }

  async findByFolder(folderId: string, _userId: string): Promise<File[]> {
    // Verify folder belongs to the user (this will be done in FoldersService)
    console.log(`Backend findByFolder: Finding files for folder ${folderId}`);

    // Get all files in this folder
    const files = await this.filesRepository.find({
      where: { folderId },
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'type', 'path', 'size', 'processed', 'createdAt', 'updatedAt', 'courseId', 'folderId', 'originalName'],
    });

    console.log(
      `Backend findByFolder: Found ${files.length} files in folder ${folderId}`,
    );
    return files;
  }

  async findOne(id: string, userId: string, includeContent: boolean = false): Promise<File> {
    // First get the file
    const selectOptions: (keyof File)[] = ['id', 'name', 'type', 'path', 'size', 'processed', 'createdAt', 'updatedAt', 'courseId', 'folderId', 'originalName'];
    const file = await this.filesRepository.findOne({
      where: { id },
      select: includeContent ? undefined : selectOptions,
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    // Then verify the course belongs to the user
    await this.coursesService.findOne(file.courseId, userId);

    return file;
  }

  async findOneForChatFlashcardsOrQuizzes(id: string): Promise<File> {
    const file = await this.filesRepository.findOne({
      where: { id },
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    return file;
  }

  /**
   * Find a file by its ID
   * In our entity, the primary key 'id' is a UUID
   */
  async findOneById(id: string, userId: string, includeContent: boolean = false): Promise<File> {
    console.log(`Finding file with ID: ${id}`);
    try {
      // First try to find by ID directly (which is the primary UUID field)
      const selectOptions: (keyof File)[] = ['id', 'name', 'type', 'path', 'size', 'processed', 'createdAt', 'updatedAt', 'courseId', 'folderId', 'originalName'];
      const file = await this.filesRepository.findOne({
        where: { id },
        relations: ['course'],
        select: includeContent ? undefined : selectOptions,
      });

      if (file) {
        console.log(
          `Found file: ${file.name} with ID: ${file.id} in course: ${file.courseId}`,
        );

        // Verify the course belongs to the user
        try {
          await this.coursesService.findOne(file.courseId, userId);
          return file;
        } catch (error: unknown) {
          console.error(
            `User ${userId} does not have access to course ${file.courseId}:`,
            error,
          );
          throw new UnauthorizedException(`You don't have access to this file`);
        }
      }

      // If not found by ID, check if this could be a reference from the AI system
      // The AI might be using IDs that come from course content mapping
      console.log(
        `File not found by direct ID, checking course files for this reference: ${id}`,
      );

      // Get all courses the user has access to
      const userCourses = await this.coursesService.findAll(userId);

      // Check each course for files
      for (const course of userCourses) {
        try {
          const courseFiles = await this.coursesService.findAllContentOfOne(
            course.id,
            userId,
          );
          // Look for a file where the mapped id matches our search id
          const matchingFile = courseFiles.find((f) => f.id === id);

          if (matchingFile) {
            console.log(
              `Found file reference in course ${course.id}: ${matchingFile.name}`,
            );
            // Now get the actual file record using the actual ID
            const actualFile = await this.filesRepository.findOne({
              where: { id },
              relations: ['course'],
            });

            if (actualFile) {
              console.log(
                `Retrieved file: ${actualFile.name} with ID: ${actualFile.id}`,
              );
              return actualFile;
            }
          }
        } catch (error: unknown) {
          console.error(`Error checking files in course ${course.id}:`, error);
          // Continue to next course
        }
      }

      // If we get here, the file wasn't found in any course
      console.error(`File with ID ${id} not found in any user course`);
      throw new NotFoundException(`File with ID ${id} not found`);
    } catch (error: unknown) {
      // If it's already a NotFoundException, just rethrow it
      if (error instanceof NotFoundException) {
        throw error;
      }

      // Otherwise log and wrap in a NotFoundException
      console.error(`Error finding file with ID ${id}:`, error);
      throw new NotFoundException(`File with ID ${id} not found`);
    }
  }

  /**
   * Find a file by searching for similar content
   * This is useful when AI provides a reference but we can't find the exact file by ID
   */
  async findFileByContent(
    referenceId: string,
    userId: string,
  ): Promise<File | null> {
    console.log(`Searching for file by content, reference ID: ${referenceId}`);

    try {
      // SPECIAL CASE - Check for the specific Spanish reference that's having issues
      // This is a temporary fix for the specific reference we're having trouble with
      const spanishReferenceStart =
        'Existe una relación de tipo positiva muy débil entre el estrés percibido';

      // Get all courses the user has access to
      const userCourses = await this.coursesService.findAll(userId);

      // Collect all files from all user courses
      let allUserFiles: File[] = [];

      for (const course of userCourses) {
        try {
          // Get all files directly associated with the course
          const courseFiles = await this.filesRepository.find({
            where: { courseId: course.id },
          });

          allUserFiles = [...allUserFiles, ...courseFiles];
        } catch (error: unknown) {
          console.error(`Error getting files from course ${course.id}:`, error);
        }
      }

      console.log(`Found ${allUserFiles.length} total files to search through`);

      // First, try the specific Spanish reference that's having issues
      for (const file of allUserFiles) {
        if (file.content && file.content.includes(spanishReferenceStart)) {
          console.log(`Found matching file by Spanish reference: ${file.name}`);
          return file;
        }
      }

      // Second, check if the reference ID itself is a snippet of text from a file
      // This happens when AI generates references with text instead of proper IDs
      for (const file of allUserFiles) {
        if (
          file.content &&
          referenceId.length > 20 &&
          file.content.includes(referenceId.substring(0, 20))
        ) {
          console.log(`Found matching file by reference ID text: ${file.name}`);
          return file;
        }
      }

      // Third, extract the reference context (if any) and search for that
      const referenceContext = this.extractReferenceContext(referenceId);

      if (referenceContext) {
        console.log(
          `Found reference context: "${referenceContext.substring(0, 50)}..."`,
        );

        // Look for files that contain this context
        for (const file of allUserFiles) {
          if (file.content && file.content.includes(referenceContext)) {
            console.log(`Found matching file by content: ${file.name}`);
            return file;
          }
        }
      }

      console.log('No files matched by content, no match found.');
      return null;
    } catch (error: unknown) {
      console.error('Error in findFileByContent:', error);
      return null;
    }
  }

  /**
   * Extract reference context from the reference ID
   * In some cases, the reference ID actually contains context text
   */
  private extractReferenceContext(referenceId: string): string | null {
    // If this is a UUID format, there's no embedded context
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        referenceId,
      )
    ) {
      return null;
    }

    // If the reference starts with text that seems like content, return it
    if (referenceId.length > 50) {
      return referenceId;
    }

    return null;
  }

  async uploadFile(
    courseId: string,
    userId: string,
    fileData: Express.Multer.File,
    type: FileType,
    content?: string,
    folderId?: string | null,
  ): Promise<File> {
    // Check course exists and belongs to user
    const _course = await this.coursesService.findOne(courseId, userId);

    // Check if total course size would exceed 100MB
    const totalSize = await this.getTotalCourseFileSize(courseId);
    if (totalSize + fileData.size > 100 * 1024 * 1024) {
      throw new BadRequestException('Course size limit of 100MB exceeded');
    }

    // Extract content if not already provided
    let extractedContent = content;
    if (!extractedContent) {
      try {
        extractedContent = await this.extractContent(fileData, type);
      } catch (error: unknown) {
        console.error(`Error extracting content from ${type} file:`, error);
        // Continue with upload even if extraction fails
        const errorMessage =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : 'Unknown error during content extraction';
        // Continue with upload even if extraction fails
        extractedContent = `Failed to extract content: ${errorMessage}`;
      }
    }

    // Generate summary
    const summary = await this.aiService.generateSummary(extractedContent);

    // Create chunks
    const chunks = this.createChunksWithOverlap(extractedContent);

    // Create file name with AI
    const fileName = await this.aiService.generateFileName(
      extractedContent,
      fileData.originalname,
    );
    
    // Create a virtual path (since we're not storing the file on disk)
    const virtualPath = `memory://${fileData.originalname}`;

    // Create file entity
    const file = this.filesRepository.create({
      name: fileName,
      originalName: fileData.originalname,
      type,
      path: virtualPath, // Store a virtual path instead of a physical file path
      size: fileData.size,
      content: extractedContent,
      summary,
      chunks,
      processed: true, // Mark as processed since we've extracted the content
      courseId,
      // Only set folderId if it's provided and not null
      ...(folderId ? { folderId } : {}),
    });

    const savedFile = await this.filesRepository.save(file);

    // Upsert text
    const namespace = this.pc
      .index(
        this.configService.get('PINECONE_INDEX_NAME') as string,
        this.configService.get('PINECONE_INDEX_HOST') as string,
      )
      .namespace(userId);

    await namespace.upsertRecords(
      chunks.map((chunk, index) => ({
        _id: `${file.id}-${index}`,
        chunk_text: chunk,
        fileId: file.id,
        name: fileName,
      })),
    );

    return savedFile;
  }

  async saveTextContent(
    courseId: string,
    userId: string,
    name: string,
    content: string,
    folderId?: string | null,
  ): Promise<File> {
    // Check course exists and belongs to user
    await this.coursesService.findOne(courseId, userId);

    // Calculate size (roughly the byte length of the content)
    const size = Buffer.byteLength(content, 'utf8');

    // Check if total course size would exceed 100MB
    const totalSize = await this.getTotalCourseFileSize(courseId);
    if (totalSize + size > 100 * 1024 * 1024) {
      throw new BadRequestException('Course size limit of 100MB exceeded');
    }

    const summary = await this.aiService.generateSummary(content);

    const chunks = this.createChunksWithOverlap(content);

    // Create file entity for plain text
    const file = this.filesRepository.create({
      name,
      type: FileType.TEXT,
      path: 'text-content', // No physical file
      size,
      content,
      summary,
      chunks,
      processed: true,
      courseId,
      // Only set folderId if it's provided and not null
      ...(folderId ? { folderId } : {}),
    });

    // Upsert text
    const namespace = this.pc
      .index(
        this.configService.get('PINECONE_INDEX_NAME') as string,
        this.configService.get('PINECONE_INDEX_HOST') as string,
      )
      .namespace(userId);

    await namespace.upsertRecords(
      chunks.map((chunk, index) => ({
        _id: `${file.id}-${index}`,
        chunk_text: chunk,
        name,
      })),
    );

    const savedFile = await this.filesRepository.save(file);

    return savedFile;
  }

  // File uploads are now associated with folders using the folderId field

  async deleteFile(id: string, userId: string): Promise<void> {
    const file = await this.findOne(id, userId);
    
    // No physical files to delete since we're storing everything in memory
    // and database, so just delete the database record
    await this.filesRepository.remove(file);
  }

  /**
   * Get the full path for a file in the format: CourseName/FolderName/FileName
   */
  /**
   * Helper function to truncate a string to a maximum length while preserving context
   * @param str String to truncate
   * @param maxLength Maximum length of the resulting string
   * @returns Truncated string
   */
  private truncateString(str: string, maxLength: number = 25): string {
    if (!str || str.length <= maxLength) return str;

    // If string is longer than max length, truncate it and add ellipsis
    // Keep first part (for context) and truncate the middle if needed
    const truncated = str.substring(0, maxLength - 3) + '...';
    return truncated;
  }

  async getFilePath(id: string, userId: string): Promise<string> {
    console.log(`Retrieving file path for file ID: ${id} for user: ${userId}`);

    try {
      const file = await this.filesRepository.findOne({
        where: { id },
        relations: ['course'],
      });

      if (!file) {
        console.error(`File with ID ${id} not found in database`);
        throw new NotFoundException(`File with ID ${id} not found`);
      }

      console.log(`Found file: ${file.name} in course: ${file.courseId}`);

      // Verify the file belongs to the user
      await this.coursesService.findOne(file.courseId, userId);

      // Get course name (handle case where course relation might be missing)
      let courseName = 'Unknown Course';
      if (file.course) {
        courseName = file.course.name;
      } else {
        // Try to get course name directly if relation failed to load
        try {
          const course = await this.coursesService.findOne(
            file.courseId,
            userId,
          );
          courseName = course.name;
        } catch (error: unknown) {
          let errorMessage = 'Unknown error';
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message: unknown }).message === 'string'
          ) {
            errorMessage = (error as { message: string }).message;
          }
          console.warn(
            `Couldn't get course name for course ID ${file.courseId}: ${errorMessage}`,
          );
        }
      }

      // Truncate course name to max 25 characters
      const truncatedCourseName = this.truncateString(courseName);

      // If file is in a folder, build the folder path
      let folderPath = '';
      if (file.folderId) {
        try {
          console.log(
            `File is in folder: ${file.folderId}, fetching folder info`,
          );
          const folder = await this.filesRepository.manager.findOne(Folder, {
            where: { id: file.folderId },
            relations: ['parent'],
          });

          if (folder) {
            console.log(`Found folder: ${folder.name}`);
            // If folder has a parent, we need to build the full path
            if (folder.parent) {
              const getParentPath = async (
                currentFolder: Folder,
              ): Promise<string> => {
                if (!currentFolder.parent) {
                  // Truncate folder name
                  return this.truncateString(currentFolder.name);
                }

                const parent = (await this.filesRepository.manager.findOne(
                  Folder,
                  {
                    where: { id: currentFolder.parent.id },
                    relations: ['parent'],
                  },
                )) as Folder;

                if (parent) {
                  // Truncate current folder name before adding to path
                  const truncatedFolderName = this.truncateString(
                    currentFolder.name,
                  );
                  return `${await getParentPath(parent)}/${truncatedFolderName}`;
                }

                return this.truncateString(currentFolder.name);
              };

              folderPath = await getParentPath(folder);
            } else {
              // Truncate folder name if it's a top-level folder
              folderPath = this.truncateString(folder.name);
            }
          }
        } catch (error: unknown) {
          let errorMessage = 'Unknown error while getting folder path';
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message: unknown }).message === 'string'
          ) {
            errorMessage = (error as { message: string }).message;
          }
          console.error('Error getting folder path:', errorMessage);
        }
      }

      // Truncate file name with a larger limit (50 chars)
      const truncatedFileName = this.truncateString(file.name, 50);

      // Build the full path
      if (folderPath) {
        return `${truncatedCourseName}/${folderPath}/${truncatedFileName}`;
      }

      return `${truncatedCourseName}/${truncatedFileName}`;
    } catch (error: unknown) {
      let errorMessage = `Unknown error getting file path for ${id}`;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
      ) {
        errorMessage = (error as { message: string }).message;
      }
      console.error(errorMessage);
      throw error; // Re-throw to be handled by the controller
    }
  }

  async moveFile(
    id: string,
    userId: string,
    folderId: string | null,
  ): Promise<File> {
    // Verify file exists and user has access
    const file = await this.findOne(id, userId);

    // Handle both null and string cases using direct SQL
    if (folderId === null) {
      // Use a raw SQL query to set the value to NULL correctly
      await this.filesRepository.query(
        `UPDATE files SET "folderId" = NULL WHERE id = $1`,
        [file.id],
      );

      // Refresh the file object
      const updatedFile = await this.filesRepository.findOne({
        where: { id: file.id },
      });
      if (!updatedFile) {
        throw new NotFoundException(
          `File with ID ${id} not found after update`,
        );
      }
      return updatedFile;
    } else {
      // For non-null values, we can assign directly
      file.folderId = folderId;
      return this.filesRepository.save(file);
    }
  }

  private async getTotalCourseFileSize(courseId: string): Promise<number> {
    const files = await this.filesRepository.find({ where: { courseId } });
    return files.reduce((total, file) => total + file.size, 0);
  }

  async extractContent(
    file: Express.Multer.File,
    fileType: FileType,
  ): Promise<string> {
    try {
      switch (fileType) {
        case FileType.PDF:
          // Extract text from PDF using pdf.js-extract
          try {
            // Create a temporary buffer for PDF extraction
            const buffer = file.buffer;
            
            // Use arraybuffer with pdf.js-extract
            const data = await pdfExtract.extractBuffer(buffer, {});
            if (!data || !data.pages) {
              throw new Error('Failed to extract PDF content');
            }

            // Combine all pages text content
            const textContent = data.pages
              .map((page) => page.content.map((item) => item.str).join(' '))
              .join('\n\n');

            return textContent || 'No text content found in PDF';
          } catch (pdfError: unknown) {
            console.error('PDF extraction error:', pdfError);
            let errorMessage = 'Unknown PDF extraction error';
            if (pdfError instanceof Error) {
              errorMessage = pdfError.message;
            } else if (
              typeof pdfError === 'object' &&
              pdfError !== null &&
              'message' in pdfError &&
              typeof (pdfError as { message: unknown }).message === 'string'
            ) {
              errorMessage = (pdfError as { message: string }).message;
            }
            throw new BadRequestException(
              `Failed to extract PDF content: ${errorMessage}`,
            );
          }

        case FileType.DOCX:
          // Extract text from DOCX using mammoth.js
          try {
            const buffer = file.buffer;
            const result = await mammoth.extractRawText({ buffer });
            return result.value || 'No text content found in DOCX';
          } catch (docxError: unknown) {
            console.error('DOCX extraction error:', docxError);
            let errorMessage = 'Unknown DOCX extraction error';
            if (docxError instanceof Error) {
              errorMessage = docxError.message;
            } else if (
              typeof docxError === 'object' &&
              docxError !== null &&
              'message' in docxError &&
              typeof (docxError as { message: unknown }).message === 'string'
            ) {
              errorMessage = (docxError as { message: string }).message;
            }
            throw new BadRequestException(
              `Failed to extract DOCX content: ${errorMessage}`,
            );
          }

        case FileType.TEXT:
          // For text files, convert buffer to string
          return Buffer.from(file.buffer).toString('utf8');

        default:
          throw new BadRequestException('Unsupported file type');
      }
    } catch (error: unknown) {
      let consoleDisplayMessage = `Error extracting content from ${fileType} file: Unknown error.`;
      let exceptionPrimaryMessage = 'Unknown error during content extraction';

      if (error instanceof Error) {
        consoleDisplayMessage = `Error extracting content from ${fileType} file: ${error.message}`;
        exceptionPrimaryMessage = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
      ) {
        const specificMessage = (error as { message: string }).message;
        consoleDisplayMessage = `Error extracting content from ${fileType} file: ${specificMessage}`;
        exceptionPrimaryMessage = specificMessage;
      } else if (typeof error === 'string') {
        consoleDisplayMessage = `Error extracting content from ${fileType} file: ${error}`;
        exceptionPrimaryMessage = error;
      }

      console.error(consoleDisplayMessage);

      throw new BadRequestException(
        `Failed to extract content: ${exceptionPrimaryMessage}`,
      );
    }
  }

  /**
   * Creates text chunks with specified overlap
   * @param text The full text to chunk
   * @param chunkSize The size of each chunk in words (default: 400)
   * @param overlapSize The overlap between chunks in words (default: 100)
   * @returns Array of text chunks with specified overlap
   */
  private createChunksWithOverlap(
    text: string,
    chunkSize: number = 400,
    overlapSize: number = 100,
  ): string[] {
    // Split the text into words
    const words = text.split(/\s+/).filter((word) => word.length > 0);

    // If we don't have enough words for even one chunk, return the entire text as a single chunk
    if (words.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < words.length) {
      // Calculate end index for this chunk (ensuring we don't go past the end of the array)
      const endIndex = Math.min(startIndex + chunkSize, words.length);

      // Extract the words for this chunk and join them back into text
      const chunkWords = words.slice(startIndex, endIndex);
      const chunk = chunkWords.join(' ');

      // Add this chunk to our results
      chunks.push(chunk);

      // Move the start index forward by (chunkSize - overlapSize) to create the overlap
      // This means we keep the last overlapSize words from the previous chunk
      startIndex += chunkSize - overlapSize;

      // If we won't have enough new words for the next chunk, break
      // This prevents creating a chunk that would be fully contained in the previous chunk
      if (startIndex + (chunkSize - overlapSize) > words.length) {
        // If we still have a significant number of new words, create one final chunk
        if (words.length - startIndex > overlapSize) {
          chunks.push(words.slice(startIndex - overlapSize).join(' '));
        }
        break;
      }
    }

    return chunks;
  }
}
