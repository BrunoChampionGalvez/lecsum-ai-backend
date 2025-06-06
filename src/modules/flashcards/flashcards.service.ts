import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Flashcard,
  FlashcardType,
  DifficultyLevel,
} from '../../entities/flashcard.entity';
import { CoursesService } from '../courses/courses.service';
import { FilesService } from '../files/files.service';
import { AiService } from '../ai/ai.service';
import { FoldersService } from '../folders/folders.service';
import { Deck } from '../../entities/deck.entity';
import { UsersService } from '../users/users.service';

interface AIGeneratedFlashcard {
  type: FlashcardType;
  front: string;
  back: string;
  difficulty: DifficultyLevel;
}

interface DeckFlashcardInfo {
  id: string;
  front: string;
  back: string;
  type: FlashcardType;
  difficulty: DifficultyLevel;
  position: number;
}

interface DeckDetails {
  id: string;
  name: string;
  description: string | null;
  path: string;
  fileIds: string[];
  flashcards: DeckFlashcardInfo[];
}

@Injectable()
export class FlashcardsService {
  constructor(
    @InjectRepository(Flashcard)
    private flashcardsRepository: Repository<Flashcard>,
    private coursesService: CoursesService,
    private filesService: FilesService,
    private aiService: AiService,
    private foldersService: FoldersService,
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    private usersService: UsersService,
  ) {}

  async findAllByCourse(
    courseId: string,
    userId: string,
  ): Promise<Flashcard[]> {
    // First verify the course belongs to the user
    await this.coursesService.findOne(courseId, userId);

    return this.flashcardsRepository.find({
      where: { courseId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Flashcard> {
    const flashcard = await this.flashcardsRepository.findOne({
      where: { id },
      relations: ['course'],
    });

    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ID ${id} not found`);
    }

    // Verify the flashcard belongs to the user
    await this.coursesService.findOne(flashcard.courseId, userId);

    return flashcard;
  }

  // Get flashcard by ID without user verification (for chat references)
  async getFlashcardById(id: string): Promise<Flashcard> {
    const flashcard = await this.flashcardsRepository.findOne({
      where: { id },
    });

    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ID ${id} not found`);
    }

    return flashcard;
  }

  // Batch fetch multiple flashcards by IDs
  async findManyById(ids: string[]): Promise<Record<string, Flashcard>> {
    if (!ids || ids.length === 0) {
      return {};
    }

    // Remove duplicate IDs
    const uniqueIds = [...new Set(ids)];

    const flashcards = await this.flashcardsRepository.find({
      where: { id: In(uniqueIds) },
    });

    // Create a map of id -> flashcard for easy access
    const flashcardMap: Record<string, Flashcard> = {};

    flashcards.forEach((flashcard) => {
      flashcardMap[flashcard.id] = flashcard;
    });

    return flashcardMap;
  }

  async generateFlashcards(
    courseId: string,
    userId: string,
    params: {
      fileIds: string[];
      folderIds: string[];
      types: FlashcardType[];
      difficulty: DifficultyLevel;
      flashcardCount: number;
      deckName: string;
    },
  ): Promise<Flashcard[]> {
    if (!courseId || courseId === '') {
      throw new BadRequestException('A valid courseId must be provided');
    }
    // Verify the course belongs to the user
    await this.coursesService.findOne(courseId, userId);

    let fileContents: Array<{
      id: string;
      name: string;
      content: string;
      type: string;
    }> = [];
    let newFileContents: Array<{
      id: string;
      name: string;
      content: string;
      type: string;
    }> = [];
    // Get files from folders if folderIds are provided
    if (params.folderIds && params.folderIds.length > 0) {
      const files = await Promise.all(
        params.folderIds.map((folderId) =>
          this.foldersService.findAllFilesRecursively(folderId, userId),
        ),
      );

      newFileContents = files.flat().map((file) => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
      }));
    }
    fileContents = fileContents
      .concat(newFileContents)
      .filter((value, index, self) => {
        const isDuplicate =
          self.findIndex((item) => item.id === value.id) !== index;
        return !isDuplicate;
      });

    // Only require file selection if no folders were selected
    if (
      (!params.fileIds || params.fileIds.length === 0) &&
      fileContents.length === 0
    ) {
      throw new BadRequestException(
        'At least one file or folder must be selected',
      );
    }

    if (!params.types || params.types.length === 0) {
      throw new BadRequestException(
        'At least one flashcard type must be selected',
      );
    }

    if (!params.difficulty) {
      throw new BadRequestException('A difficulty level must be selected');
    }

    if (!params.flashcardCount) {
      throw new BadRequestException('A flashcard count must be selected');
    }

    // Fetch file contents from directly selected files
    const directlySelectedFiles =
      params.fileIds && params.fileIds.length > 0
        ? await Promise.all(
            params.fileIds.map((fileId) =>
              this.filesService.findOne(fileId, userId),
            ),
          )
        : [];

    // Combine directly selected files with files from folders
    const files = [...directlySelectedFiles, ...fileContents].filter(
      (value, index, self) => {
        const isDuplicate =
          self.findIndex((item) => item.id === value.id) !== index;
        return !isDuplicate;
      },
    );

    // Ensure we have at least one file
    if (files.length === 0) {
      throw new BadRequestException('No files found in the selected folders');
    }

    // Generate flashcards using AI
    const generatedFlashcards = await this.aiService.generateFlashcards(
      files,
      params.types,
      params.flashcardCount,
      params.difficulty,
    );

    // Check if we got a valid string response from the AI service
    if (!generatedFlashcards || typeof generatedFlashcards !== 'string') {
      throw new BadRequestException('Failed to generate flashcards');
    }

    // Safely parse the JSON
    let parsedFlashcards: AIGeneratedFlashcard[];
    try {
      parsedFlashcards = JSON.parse(
        generatedFlashcards
          .replace(/^\s*```[a-z]*\s*/i, '')
          .replace(/\s*```[\s\n]*$/, '')
          .trim(),
      ) as AIGeneratedFlashcard[];
      if (!Array.isArray(parsedFlashcards) || parsedFlashcards.length === 0) {
        throw new BadRequestException('No valid flashcards were generated');
      }
    } catch (error: unknown) {
      console.error('Error parsing flashcards JSON:', error);
      throw new BadRequestException('Failed to parse generated flashcards');
    }

    // Prepare the flashcard entities from the parsed data
    const flashcardData = parsedFlashcards.map((fc: AIGeneratedFlashcard) => ({
      type: fc.type,
      front: fc.front,
      back: fc.back,
      difficulty: fc.difficulty,
      courseId,
      aiGenerated: true,
    }));

    // Save the entities to the database
    const savedFlashcards = await this.flashcardsRepository.save(flashcardData);

    const user = await this.usersService.findOne(userId);

    const deckEntity = this.decksRepository.create({
      name: params.deckName,
      courseId,
      flashcards: savedFlashcards,
      aiGenerated: true,
      userId,
      user,
      fileIds: files.map((file) => file.id),
    });
    await this.decksRepository.save(deckEntity);

    return savedFlashcards;
  }

  async deleteFlashcard(id: string, userId: string): Promise<void> {
    const flashcard = await this.findOne(id, userId);
    await this.flashcardsRepository.remove(flashcard);
  }

  async findDeckById(id: string, userId: string): Promise<DeckDetails> {
    const deck = await this.decksRepository.findOne({
      where: { id },
      relations: ['flashcards', 'course'],
    });

    if (!deck) {
      throw new NotFoundException(`Flashcard deck with ID ${id} not found`);
    }

    // Verify the deck belongs to the user
    await this.coursesService.findOne(deck.courseId, userId);

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      path: await this.getDeckPath(id, userId),
      fileIds: deck.fileIds,
      flashcards: deck.flashcards.map((f: Flashcard) => ({
        id: f.id,
        front: f.front,
        back: f.back,
        type: f.type,
        difficulty: f.difficulty,
        position: deck.flashcards.indexOf(f) + 1,
      })),
    };
  }

  /**
   * Get the full path for a flashcard in the format: CourseName/DeckName/FlashcardPosition
   */
  async getFlashcardPath(flashcardId: string, userId: string): Promise<string> {
    const flashcard = await this.flashcardsRepository.findOne({
      where: { id: flashcardId },
      relations: ['deck', 'course'],
    });

    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ID ${flashcardId} not found`);
    }

    // Verify the flashcard belongs to the user
    await this.coursesService.findOne(flashcard.courseId, userId);

    // Get the deck
    const deck = await this.decksRepository.findOne({
      where: { id: flashcard.deckId },
      relations: ['flashcards'],
    });

    if (!deck) {
      throw new NotFoundException(
        `Deck for flashcard with ID ${flashcardId} not found`,
      );
    }

    // Find the position of this flashcard in the deck
    const position =
      deck.flashcards.findIndex((f: Flashcard) => f.id === flashcardId) + 1;

    // Get course name
    const course = await this.coursesService.findOne(
      flashcard.courseId,
      userId,
    );

    return `${course.name}/${deck.name}/Flashcard ${position}`;
  }

  /**
   * Get the full path for a deck in the format: CourseName/DeckName
   */
  async getDeckPath(deckId: string, userId: string): Promise<string> {
    const deck = await this.decksRepository.findOne({
      where: { id: deckId },
      relations: ['course'],
    });

    if (!deck) {
      throw new NotFoundException(`Deck with ID ${deckId} not found`);
    }

    // Verify the deck belongs to the user
    const course = await this.coursesService.findOne(deck.courseId, userId);

    return `${course.name}/${deck.name}`;
  }

  async create(data: Partial<Flashcard>, _userId: string): Promise<Flashcard> {
    if (!data.deckId) throw new BadRequestException('deckId is required');
    // Optionally verify deck/course ownership by userId here
    const flashcard = this.flashcardsRepository.create(data);
    return this.flashcardsRepository.save(flashcard);
  }

  async update(
    id: string,
    data: Partial<Flashcard>,
    _userId: string,
  ): Promise<Flashcard> {
    const flashcard = await this.flashcardsRepository.findOne({
      where: { id },
    });
    if (!flashcard)
      throw new NotFoundException(`Flashcard with ID ${id} not found`);
    // Optionally verify deck/course ownership by userId here
    Object.assign(flashcard, data);
    return this.flashcardsRepository.save(flashcard);
  }
}
