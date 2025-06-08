import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Folder } from '../../entities/folder.entity';
import { File } from '../../entities/file.entity';
import { CoursesService } from '../courses/courses.service';
import { CreateFolderDto } from './dto/create-folder.dto';

@Injectable()
export class FoldersService {
  constructor(
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @Inject(forwardRef(() => CoursesService))
    private coursesService: CoursesService,
  ) {}

  async findAllByCourse(courseId: string, userId: string): Promise<Folder[]> {
    // First verify the course belongs to the user
    await this.coursesService.findOne(courseId, userId);

    // Get all root level folders that belong to this course
    return this.foldersRepository.find({
      where: { courseId, parentId: IsNull() },
      relations: ['children'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(userId: string): Promise<Folder[]> {
    // Get all courses for this user
    const courses = await this.coursesService.findAll(userId);
    const courseIds = courses.map((course) => course.id);

    // Get all folders that belong to any of the user's courses
    return this.foldersRepository.find({
      where: { courseId: In(courseIds) },
      relations: ['course'],
      order: { createdAt: 'DESC' },
    });
  }

  async findFolderContents(
    folderId: string,
    userId: string,
    options?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{ folders: Folder[]; total: number }> {
    await this.findOne(folderId, userId);
    
    const page = options?.page || 1;
    const limit = options?.limit || 20; // Default to 20 folders per page
    const skip = (page - 1) * limit;
    
    // Count total subfolders first
    const total = await this.foldersRepository.count({
      where: { parentId: folderId }
    });
    
    // Get direct children of this folder with pagination
    const folders = await this.foldersRepository.find({
      where: { parentId: folderId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit
    });
    
    return { folders, total };
  }

  async findOne(id: string, userId: string): Promise<Folder> {
    const folder = await this.foldersRepository.findOne({
      where: { id },
      relations: ['course'],
    });

    if (!folder) {
      throw new NotFoundException(`Folder with ID ${id} not found`);
    }

    // Verify the folder belongs to the user
    await this.coursesService.findOne(folder.courseId, userId);

    return folder;
  }

  async createFolder(
    courseId: string,
    userId: string,
    createFolderDto: CreateFolderDto,
  ): Promise<Folder> {
    // Check course exists and belongs to user
    await this.coursesService.findOne(courseId, userId);

    // If parentId is provided, verify it exists and is a folder
    if (createFolderDto.parentId) {
      const parentFolder = await this.findOne(createFolderDto.parentId, userId);

      // Verify parent belongs to the same course
      if (parentFolder.courseId !== courseId) {
        throw new BadRequestException(
          'Parent folder does not belong to this course',
        );
      }
    }

    // Create folder entity
    const folder = new Folder();
    folder.name = createFolderDto.name;
    folder.courseId = courseId;
    // If parentId is provided, use it; otherwise don't set it and let the db handle it
    if (createFolderDto.parentId) {
      folder.parentId = createFolderDto.parentId;
    }

    return this.foldersRepository.save(folder);
  }

  async deleteFolder(id: string, userId: string): Promise<void> {
    const folder = await this.findOne(id, userId);

    // Delete all contents recursively
    await this.deleteFolderContentsRecursively(id, userId);

    // Finally remove the folder itself
    await this.foldersRepository.remove(folder);
  }

  /**
   * Recursively deletes all contents of a folder including subfolders and files
   */
  private async deleteFolderContentsRecursively(
    folderId: string,
    userId: string,
  ): Promise<void> {
    // Step 1: Get all child folders
    const childFolders = await this.foldersRepository.find({
      where: { parentId: folderId },
    });

    // Step 2: Recursively delete each child folder's contents
    for (const childFolder of childFolders) {
      await this.deleteFolderContentsRecursively(childFolder.id, userId);
      // Remove the child folder after its contents are deleted
      await this.foldersRepository.remove(childFolder);
    }

    // Step 3: Delete all files in this folder
    const folderWithFiles = await this.foldersRepository
      .createQueryBuilder('folder')
      .leftJoinAndSelect('folder.files', 'files')
      .where('folder.id = :id', { id: folderId })
      .getOne();

    if (
      folderWithFiles &&
      folderWithFiles.files &&
      folderWithFiles.files.length > 0
    ) {
      // Delete all files associated with this folder
      await Promise.all(
        folderWithFiles.files.map((file: File) =>
          this.filesRepository.remove(file),
        ),
      );
    }
  }

  async moveFolder(
    id: string,
    userId: string,
    newParentId: string | null,
  ): Promise<Folder> {
    // Verify folder exists and belongs to user
    const folder = await this.findOne(id, userId);

    // If moving to a new parent folder (not to root)
    if (newParentId) {
      // Verify the target parent folder exists and belongs to user
      const parentFolder = await this.findOne(newParentId, userId);

      // Verify target parent belongs to the same course
      if (parentFolder.courseId !== folder.courseId) {
        throw new BadRequestException(
          'Target folder does not belong to the same course',
        );
      }

      // Check for circular references - prevent moving a folder into its own descendant
      let currentFolder = parentFolder;
      while (currentFolder.parentId) {
        if (currentFolder.parentId === id) {
          throw new BadRequestException(
            'Cannot move a folder into its own descendant',
          );
        }
        // Get the parent of current folder
        const parentFolder = await this.foldersRepository.findOne({
          where: { id: currentFolder.parentId },
        });
        if (!parentFolder) break;
        currentFolder = parentFolder;
      }
    }

    // Update the folder's parent
    // TypeScript needs to understand that parentId can be null
    folder.parentId = newParentId as string;
    console.log(`Moving folder ${id} to parent ${newParentId}`);

    // Save and return updated folder
    return this.foldersRepository.save(folder);
  }

  /**
   * Recursively find all files within a folder and its subfolders
   * @param folderId ID of the parent folder
   * @param userId ID of the user making the request
   * @returns Promise with array of all files in the folder and its subfolders
   */
  async findAllFilesRecursively(
    folderId: string,
    userId: string,
  ): Promise<File[]> {
    // Verify folder exists and belongs to user
    await this.findOne(folderId, userId);

    // Store all files in this result array
    let allFiles: File[] = [];

    // Get files directly in this folder
    const filesInFolder = await this.filesRepository.find({
      where: { folderId },
      order: { createdAt: 'DESC' },
    });

    // Add files to result
    allFiles = [...filesInFolder];

    // Get all subfolders
    const subfolders = await this.foldersRepository.find({
      where: { parentId: folderId },
    });

    // Recursively get files from each subfolder
    for (const subfolder of subfolders) {
      const subfolderFiles = await this.findAllFilesRecursively(
        subfolder.id,
        userId,
      );
      allFiles = [...allFiles, ...subfolderFiles];
    }

    return allFiles;
  }
}
