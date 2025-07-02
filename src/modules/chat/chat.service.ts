import {
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatSession } from '../../entities/chat-session.entity';
import { ChatMessage, MessageRole } from '../../entities/chat-message.entity';
import { FilesService } from '../files/files.service';
import { AiService } from '../ai/ai.service';
import { CoursesService } from '../courses/courses.service';
import { FoldersService } from '../folders/folders.service';
import { Flashcard } from '../../entities/flashcard.entity';
import { Deck } from '../../entities/deck.entity';
import { Quiz } from '../../entities/quiz.entity';
import { QuizQuestion } from '../../entities/quiz-question.entity';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { QuizzesService } from '../quizzes/quizzes.service';
import {
  CitationType,
  FileCitation,
  FlashcardDeckCitation,
  QuizCitation,
} from '../../entities/chat-message.entity';

// Interfaces for typing service responses
interface FlashcardItem {
  id: string;
  front: string;
  back: string;
}

interface DeckWithFlashcards {
  id: string;
  name: string;
  fileIds: string[];
  flashcards: FlashcardItem[];
}

interface QuizQuestionItem {
  id: string;
  question: string;
  correctAnswer: string;
}

interface QuizWithQuestions {
  id: string;
  title: string; // Corresponds to 'name' in quizzesContents
  fileIds: string[];
  questions: QuizQuestionItem[];
}

interface AICitation {
  type: string; // string for broader compatibility
  id: string;
  // Potentially other fields from AI response
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession)
    private chatSessionsRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private chatMessagesRepository: Repository<ChatMessage>,
    private filesService: FilesService,
    private aiService: AiService,
    @Inject(forwardRef(() => CoursesService))
    private coursesService: CoursesService,
    private foldersService: FoldersService,
    private flashcardsService: FlashcardsService,
    private quizzesService: QuizzesService,
  ) {}

  async findAllSessionsByUser(userId: string): Promise<ChatSession[]> {
    return this.chatSessionsRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findSessionById(id: string, userId: string): Promise<ChatSession> {
    const session = await this.chatSessionsRepository.findOne({
      where: { id, userId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Chat session with ID ${id} not found`);
    }

    return session;
  }

  async findMany(ids: string[], userId: string): Promise<ChatSession[]> {
    return this.chatSessionsRepository.find({
      where: { id: In(ids), userId },
    });
  }

  private async generateSessionName(
    fileIds: string[],
    userId: string,
  ): Promise<string> {
    if (fileIds && fileIds.length > 0) {
      try {
        const firstFileId = fileIds[0];
        // Assuming filesService.findOneById returns an object with 'name' or 'originalName'
        const file = await this.filesService.findOneById(firstFileId, userId);
        if (file && file.name) {
          return file.name.length > 100
            ? file.name.substring(0, 97) + '...'
            : file.name;
        } else if (file && file.originalName) {
          return file.originalName.length > 100
            ? file.originalName.substring(0, 97) + '...'
            : file.originalName;
        }
      } catch (error: unknown) {
        let message = 'Unknown error';
        if (error instanceof Error) {
          message = error.message;
        }
        console.warn(
          `Could not generate session name from file ID ${fileIds[0]}: ${message}`,
        );
      }
    }
    return 'New Chat Session';
  }

  async createSession(
    userId: string,
    fileIds: string[] = [],
    name?: string,
  ): Promise<ChatSession> {
    // Validate that files exist and belong to the user if fileIds provided
    if (fileIds && fileIds.length > 0) {
      await Promise.all(
        fileIds.map((fileId) => this.filesService.findOne(fileId, userId)),
      );
    }

    // Create a new chat session with provided name or a default one
    const session = this.chatSessionsRepository.create({
      name: 'New Chat',
      nameWasAiGenerated: false,
      contextFileIds: fileIds,
      userId,
    });

    return this.chatSessionsRepository.save(session);
  }

  async updateSession(
    id: string,
    userId: string,
    updateDto: { name?: string },
  ): Promise<ChatSession> {
    // Find the session to update
    const session = await this.findSessionById(id, userId);

    // Update the session properties
    if (updateDto.name) {
      session.name = updateDto.name;
    }

    // Save and return the updated session
    return this.chatSessionsRepository.save(session);
  }

  async *sendMessage(
    sessionId: string,
    userId: string,
    content: string,
    flashCardDeckIds: string[] = [],
    quizIds: string[] = [],
    previousSessionsIds: string[] = [],
    fileIds: string[] = [],
    folderIds: string[] = [],
    courseId: string = '',
    thinkMode: boolean = false,
  ): AsyncGenerator<string> {
    // Get file contents variables we'll need regardless of try/catch flow
    let fileContents: Array<{
      id: string;
      name: string;
      content: string;
      type: string;
      originalName: string;
    }> = [];
    let newFileContents: Array<{
      id: string;
      name: string;
      content: string;
      type: string;
      originalName: string;
    }> = [];
    let flashCardDecksContents: Array<{
      id: string;
      name: string;
      fileIds: string[];
      flashcards: Array<{ id: string; front: string; back: string }>;
    }> = [];
    let quizzesContents: Array<{
      id: string;
      name: string;
      fileIds: string[];
      questions: Array<{ id: string; question: string; answer: string }>;
    }> = [];

    // Create message variables outside try so we can reference them in catch
    let userMessage: ChatMessage;
    let session: ChatSession;
    let updatedSession: ChatSession;
    let messages: ChatMessage[] = [];

    // Create a session context object we can use throughout the method
    let sessionContext: ChatSession & {
      flashCardDeckIds: string[];
      quizIds: string[];
      previousSessionsIds: string[];
      contextFileIds: string[];
      courseId: string;
    };

    try {
      // Validate session exists and belongs to user
      session = await this.findSessionById(sessionId, userId);

      if (!session) {
        throw new Error(
          `Session with ID ${sessionId} not found or does not belong to user ${userId}`,
        );
      }

      if (session.nameWasAiGenerated === false) {
        session.name = await this.aiService.generateSessionName(content);
        session.nameWasAiGenerated = true;
        await this.chatSessionsRepository.save(session);
      }

      console.log(
        `Processing message for session ${sessionId}, user ${userId}`,
      );

      // Setup session context
      sessionContext = {
        ...session,
        flashCardDeckIds,
        quizIds,
        previousSessionsIds,
        courseId,
        contextFileIds: [...new Set([...session.contextFileIds, ...fileIds])],
      };
    } catch (error: unknown) {
      console.error('Error processing message:', error);
      let errorMessage =
        'An unknown error occurred while processing your message.';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      yield JSON.stringify({
        error: 'Error processing your message: ' + errorMessage,
      });
      return; // Exit the generator
    }

    // Simplified deck handling to avoid TypeScript errors
    if (
      sessionContext.flashCardDeckIds &&
      sessionContext.flashCardDeckIds.length > 0
    ) {
      try {
        // Process flashcard decks asynchronously and await all promises
        flashCardDecksContents = await Promise.all(
          sessionContext.flashCardDeckIds.map(async (deckId) => {
            const deck = (await this.flashcardsService.findDeckById(
              deckId,
              userId,
            )) as DeckWithFlashcards;
            return {
              id: deck.id,
              name: deck.name,
              fileIds: deck.fileIds,
              flashcards: deck.flashcards.map((flashcard: FlashcardItem) => ({
                id: flashcard.id,
                front: flashcard.front,
                back: flashcard.back,
              })),
            };
          }),
        );
      } catch (error) {
        console.error('Error handling flashcard decks:', error);
      }
    }

    // Simplified quiz handling to avoid TypeScript errors
    if (sessionContext.quizIds && sessionContext.quizIds.length > 0) {
      try {
        // For now, just create placeholder content to avoid TypeScript errors
        // We'll add actual quiz content later when we resolve type issues
        quizzesContents = await Promise.all(
          sessionContext.quizIds.map(async (quizId) => {
            const quiz: QuizWithQuestions = await this.quizzesService.findOne(
              quizId,
              userId,
            );
            return {
              id: quiz.id,
              name: quiz.title, // quiz.title maps to quizzesContents.name
              fileIds: quiz.fileIds,
              questions: quiz.questions.map((question: QuizQuestionItem) => ({
                id: question.id,
                question: question.question,
                answer: question.correctAnswer, // map correctAnswer to quizzesContents.answer
              })),
            };
          }),
        );
      } catch (error) {
        console.error('Error handling quizzes:', error);
      }
    }

    if (
      sessionContext.contextFileIds &&
      sessionContext.contextFileIds.length > 0
    ) {
      const files = await Promise.all(
        sessionContext.contextFileIds.map((fileId) =>
          this.filesService.findOneForChatFlashcardsOrQuizzes(fileId),
        ),
      );

      fileContents = files.map((file) => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }));
    }

    if (flashCardDecksContents.some((deck) => deck.fileIds.length > 0)) {
      // Flatten the nested array of promises before awaiting
      const filePromises = flashCardDecksContents.flatMap((deck) =>
        deck.fileIds.map((fileId) =>
          this.filesService.findOneForChatFlashcardsOrQuizzes(fileId),
        ),
      );

      // Now await the flattened array of promises
      const files = await Promise.all(filePromises);

      // Process the resolved files
      fileContents = [
        ...fileContents,
        ...files.map((file) => ({
          id: file.id,
          name: file.name,
          content: file.content || 'Content not available',
          type: file.type.toString(), // Convert FileType enum to string
          originalName: file.originalName,
        })),
      ];

      fileIds = [...fileIds, ...files.map((file) => file.id)];
    }

    if (quizzesContents.some((quiz) => quiz.fileIds.length > 0)) {
      const filePromises = quizzesContents.flatMap((quiz) =>
        quiz.fileIds.map((fileId) =>
          this.filesService.findOneForChatFlashcardsOrQuizzes(fileId),
        ),
      );

      const files = await Promise.all(filePromises);

      fileContents = [
        ...fileContents,
        ...files.map((file) => ({
          id: file.id,
          name: file.name,
          content: file.content || 'Content not available',
          type: file.type.toString(), // Convert FileType enum to string
          originalName: file.originalName,
        })),
      ];

      fileIds = [...fileIds, ...files.map((file) => file.id)];
    }

    if (folderIds && folderIds.length > 0) {
      const files = await Promise.all(
        folderIds.map((folderId) =>
          this.foldersService.findAllFilesRecursively(folderId, userId),
        ),
      );

      newFileContents = files.flat().map((file) => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }));

      fileIds = [...fileIds, ...files.flat().map((file) => file.id)];
    }
    fileContents = [...fileContents, ...newFileContents];

    fileContents = fileContents.filter((value, index, self) => {
      const isDuplicate =
        self.findIndex((item) => item.id === value.id) !== index;
      return !isDuplicate;
    });

    // If courseId is explicitly provided, always load all course content
    // This ensures the entire course is considered when a user explicitly selects a course
    if (sessionContext.courseId) {
      try {
        console.log('Loading all content for course:', sessionContext.courseId);
        const course = await this.coursesService.findAllContentOfOne(
          sessionContext.courseId,
          userId,
        );
        if (course) {
          fileContents = [
            ...fileContents,
            ...course.map((file) => ({
              id: file.id,
              name: file.name,
              content: file.content,
              type: file.type,
              originalName: file.originalName,
            })),
          ].filter((value, index, self) => {
            const isDuplicate =
              self.findIndex((item) => item.id === value.id) !== index;
            return !isDuplicate;
          });

          fileIds = [...fileIds, ...course.map((file) => file.id)];
        }
      } catch (error) {
        console.error('Error handling course:', error);
      }
    }

    fileIds = [...new Set(fileIds)];

    let extractedContent: Array<{
      fileId: string;
      name: string;
      content: string;
    }> = [];
    const category = await this.aiService.userQueryCategorizer(content);
    if (content) {
      if (fileIds.length > 0) {
        if (category === 'SPECIFIC') {
          const searchResults = await this.aiService.semanticSearch(
            content,
            userId,
          );
          extractedContent = [
            ...extractedContent,
            ...searchResults.map((result) => ({
              fileId: (result.fields as { fileId: string }).fileId,
              name: (result.fields as { name: string; chunk_text: string })
                .name,
              content: (result.fields as { name: string; chunk_text: string })
                .chunk_text,
              userId: (result.fields as { userId: string }).userId,
            })).filter((result) => {
              return result.userId === userId;
            }),
          ];

          fileContents = [];
        } else {
          fileContents = fileContents.slice(0, 4);
        }
      } else {
        if (category === 'SPECIFIC') {
          const searchResults = await this.aiService.semanticSearch(
            content,
            userId,
          );
          extractedContent = [
            ...extractedContent,
            ...searchResults.map((result) => ({
              fileId: (result.fields as { fileId: string }).fileId,
              name: (result.fields as { name: string; chunk_text: string })
                .name,
              content: (result.fields as { name: string; chunk_text: string })
                .chunk_text,
            })),
          ];
        } else {
          fileContents = [];
          extractedContent = [];
        }
      }

      console.log(
        '🎯 Chat Service: Starting sendMessage for session',
        sessionId,
      );

      const extractedFileContentsStr =
        extractedContent.length > 0
          ? extractedContent
              .map(
                (file) =>
                  `File name: ${file.name}\nContent: ${file.content}\nFile Id: ${file.fileId}`,
              )
              .join('\n\n')
          : 'No extracted content from files provided for this message';

      // Convert array objects to strings for AI service
      const fileContentsStr =
        fileContents.length > 0
          ? fileContents
              .map(
                (file) =>
                  `File title: ${file.name}\nFile original name: ${file.originalName}\nContent: ${file.content}\nFile Id: ${file.id}`,
              )
              .join('\n\n')
          : 'No files context provided for this message';

      const flashCardDecksContentsStr =
        flashCardDecksContents.length > 0
          ? flashCardDecksContents
              .map(
                (deck) =>
                  `Flashcard deck name: ${deck.name}\nFlashcard deck id: ${deck.id}\nFile ids: ${deck.fileIds.length > 0 ? deck.fileIds.join(', ') : 'No files were used in creating this flashcard deck.'}\nFlashcards: \n${deck.flashcards.map((flashcard) => `Id: ${flashcard.id}\nFront: ${flashcard.front}\nBack: ${flashcard.back}`).join('\n\n')}`,
              )
              .join('\n\n')
          : 'No flashcard decks context provided for this message';

      const quizzesContentsStr =
        quizzesContents.length > 0
          ? quizzesContents
              .map(
                (quiz) =>
                  `Quiz name: ${quiz.name}\nQuiz id: ${quiz.id}\nFile ids: ${quiz.fileIds.length > 0 ? quiz.fileIds.join(', ') : 'No files were used in creating this quiz.'}\nQuestions: \n${quiz.questions.map((question) => `Id: ${question.id}\nQuestion: ${question.question}\nAnswer: ${question.answer}`).join('\n\n')}`,
              )
              .join('\n\n')
          : 'No quizzes context provided for this message';

      console.log('📝 Chat Service: Converted content arrays to strings');
      console.log(
        `📊 Chat Service: fileContentsStr length: ${fileContentsStr.length}`,
      );
      console.log(
        `📊 Chat Service: flashCardDecksContentsStr length: ${flashCardDecksContentsStr.length}`,
      );
      console.log(
        `📊 Chat Service: quizzesContentsStr length: ${quizzesContentsStr.length}`,
      );
      console.log(
        `📊 Chat Service: extractedFileContentsStr length: ${extractedFileContentsStr.length}`,
      );

      const context = `\n\nFile Context: ${fileContentsStr}\n\nExtracted File Content Context: ${extractedFileContentsStr}\n\nFlashcard Decks Context: ${flashCardDecksContentsStr}\n\nQuizzes Context: ${quizzesContentsStr}`;

      // Create user message - ensure chatSessionId is set
      userMessage = this.chatMessagesRepository.create({
        role: MessageRole.USER,
        content: content,
        chatSessionId: sessionId, // Explicit assignment
      });

      console.log(`Saving user message for session ${sessionId}`);
      await this.chatMessagesRepository.save(userMessage);

      // Double-check that the message was saved with the correct sessionId
      const savedMessage = await this.chatMessagesRepository.findOne({
        where: { id: userMessage.id },
      });

      if (!savedMessage || savedMessage.chatSessionId !== sessionId) {
        console.error('Message not properly linked to session:', {
          messageId: userMessage.id,
          expectedSessionId: sessionId,
          actualSessionId: savedMessage?.chatSessionId,
        });
      }

      // Get all messages for context
      updatedSession = await this.findSessionById(sessionId, userId);
      messages = updatedSession.messages || [];

      const responseGenerator = this.aiService.generateChatResponse(
        messages,
        thinkMode,
        context,
      );

      console.log('🔄 Chat Service: Got response generator from AI service');

      // Collect all yielded content
      let streamedContent = '';
      let chunkIndex = 0;

      console.log('📡 Chat Service: Starting to process streaming chunks');

      // Process the generator to yield chunks and collect complete content
      for await (const chunk of responseGenerator) {
        chunkIndex++;

        if (chunk) {
          console.log(
            `📥 Chat Service: Received chunk ${chunkIndex}, length: ${chunk.length}`,
          );
          console.log(
            `📥 Chat Service: Chunk ${chunkIndex} content: "${chunk}"`,
          );

          const beforeLength = streamedContent.length;
          streamedContent += chunk;
          const afterLength = streamedContent.length;

          console.log(
            `📊 Chat Service: Added chunk ${chunkIndex}. Before: ${beforeLength}, After: ${afterLength}, Expected: ${beforeLength + chunk.length}`,
          );

          if (afterLength !== beforeLength + chunk.length) {
            console.error(
              `❌ Chat Service: CHARACTER LOSS DETECTED! Expected ${beforeLength + chunk.length}, got ${afterLength}`,
            );
          }

          yield chunk;
          console.log(
            `✅ Chat Service: Yielded chunk ${chunkIndex} to frontend`,
          );
        } else {
          console.log(`⚠️ Chat Service: Received empty chunk ${chunkIndex}`);
        }
      }

      console.log(`🏁 Chat Service: Finished processing ${chunkIndex} chunks`);
      console.log(
        `📊 Chat Service: Final streamedContent length: ${streamedContent.length}`,
      );
      console.log(
        `📄 Chat Service: Final streamedContent preview: "${streamedContent.substring(0, 200)}..."`,
      );

      // Extract citations from the complete streamed content
      console.log('🔍 Chat Service: Starting citation extraction');
      const citations: AICitation[] = [];
      const citationRegex = /\[REF\]([\s\S]*?)\[\/REF\]/gs;
      const citationMatches = streamedContent.match(citationRegex) || [];

      console.log(
        `🔗 Chat Service: Found ${citationMatches.length} citation matches`,
      );

      for (const match of citationMatches) {
        try {
          // Extract just the content between [REF] and [/REF] tags
          const contentMatch = match.match(/\[REF\]([\s\S]*?)\[\/REF\]/i);
          if (contentMatch && contentMatch[1]) {
            const jsonContent = contentMatch[1].trim();
            console.log(
              `🔗 Chat Service: Parsing citation JSON: "${jsonContent}"`,
            );
            const citation = JSON.parse(jsonContent) as AICitation;
            citations.push(citation);
            console.log(
              `✅ Chat Service: Successfully parsed citation:`,
              citation,
            );
          }
        } catch (e) {
          console.error('❌ Chat Service: Failed to parse citation JSON:', e);
          console.log('❌ Chat Service: Problematic content:', match);
        }
      }

      // Ensure we have valid content
      const finalContent =
        streamedContent ||
        'Sorry, I encountered an error while processing your request.';

      console.log(
        `💾 Chat Service: About to save message with content length: ${finalContent.length}`,
      );

      // Transform AICitation objects to entity citation types
      const transformedEntityCitations = await Promise.all(
        citations.map(async (citation: AICitation) => {
          try {
            // Validate citation type to ensure it's one of the expected enum values
            if (
              citation.type !== String(CitationType.FILE) &&
              citation.type !== String(CitationType.FLASHCARD_DECK) &&
              citation.type !== String(CitationType.QUIZ)
            ) {
              console.warn(
                `Unsupported citation type: "${citation.type}" with ID "${citation.id}". Skipping.`,
              );
              return null;
            }

            const pathOrName = await this.getReferencePathById(
              citation,
              userId,
            );

            if (citation.type === String(CitationType.FILE)) {
              return {
                type: CitationType.FILE,
                id: citation.id,
                text: pathOrName, // pathOrName is the file path
              } as FileCitation;
            } else if (citation.type === String(CitationType.FLASHCARD_DECK)) {
              return {
                type: CitationType.FLASHCARD_DECK,
                id: citation.id, // This is the Deck ID
                flashCardId: pathOrName, // Using deck name as placeholder
              } as FlashcardDeckCitation;
            } else if (citation.type === String(CitationType.QUIZ)) {
              return {
                type: CitationType.QUIZ,
                id: citation.id, // This is the Quiz ID
                questionId: pathOrName, // Using quiz title as placeholder
              } as QuizCitation;
            }
            // This case should ideally not be reached if types are validated above
            console.warn(
              `Citation type ${String(citation.type)} was not processed after validation.`,
            );
            return null;
          } catch (e: unknown) {
            // Typed error object
            let message = 'Unknown error during citation transformation';
            if (e instanceof Error) {
              message = e.message;
            }
            console.error(
              `Error transforming citation (type: ${citation.type}, id: ${citation.id}): ${message}`,
              e, // Log the original error object for more details
            );
            return null;
          }
        }),
      );

      const finalCitations = transformedEntityCitations.filter(
        (c) => c !== null,
      );

      // Create AI message with the final content and citations
      const aiMessage = this.chatMessagesRepository.create({
        role: MessageRole.AI,
        content: finalContent,
        citations: finalCitations,
        chatSessionId: sessionId,
      });

      await this.chatMessagesRepository.save(aiMessage);
      console.log(
        `✅ Chat Service: Successfully saved AI message with ID: ${aiMessage.id}`,
      );

      return { message: userMessage, aiResponse: aiMessage };
    } else {
      throw new BadRequestException('Empty user message');
    }
  }

  // ... (rest of the code remains the same)

  async getReferencePathById(
    reference: AICitation, // Changed from individual params
    userId: string,
  ): Promise<string> {
    const { type: referenceType, id: referenceId } = reference;
    try {
      switch (referenceType) {
        case 'file':
          // First, try to find the file using our enhanced lookup method
          try {
            console.log(
              `Getting file using enhanced lookup for ID: ${referenceId}`,
            );
            const file = await this.filesService.findOneById(
              referenceId,
              userId,
            );
            if (file) {
              // If we found the file, now get its path
              console.log(`File found, getting path for file ID: ${file.id}`);
              return this.filesService.getFilePath(file.id, userId);
            }
          } catch (error) {
            console.error(
              `Enhanced file lookup failed for ${referenceId}, falling back to direct path lookup:`,
              error,
            );
            // Fall back to direct path lookup
            return this.filesService.getFilePath(referenceId, userId);
          }
        case 'quiz':
          return await this.getQuizPath(referenceId, userId);
        case 'flashcardDeck':
          return await this.getDeckPath(referenceId, userId);
        default:
          throw new BadRequestException(
            `Invalid reference type: ${referenceType}`,
          );
      }
    } catch (error) {
      console.error(
        `Error in getReferencePathById for ${referenceType}:${referenceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the path for a flashcard
   */
  private async getFlashcardPath(
    flashcardId: string,
    userId: string,
  ): Promise<string> {
    // Get the flashcard with its related deck and course
    const flashcard = await this.chatMessagesRepository.manager.findOne(
      Flashcard,
      {
        where: { id: flashcardId },
        relations: ['deck', 'deck.course'],
      },
    );

    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ID ${flashcardId} not found`);
    }

    // Verify course ownership
    await this.coursesService.findOne(flashcard.deck.courseId, userId);

    // Find the position of this flashcard in the deck
    const flashcards = await this.chatMessagesRepository.manager.find(
      Flashcard,
      {
        where: { deckId: flashcard.deckId },
        order: { createdAt: 'ASC' },
      },
    );

    const position = flashcards.findIndex((f) => f.id === flashcardId) + 1;

    return `${flashcard.deck.course.name}/${flashcard.deck.name}/Flashcard ${position}`;
  }

  /**
   * Get the path for a deck
   */
  private async getDeckPath(deckId: string, userId: string): Promise<string> {
    const deck = await this.chatMessagesRepository.manager.findOne(Deck, {
      where: { id: deckId },
      relations: ['course'],
    });

    if (!deck) {
      throw new NotFoundException(`Deck with ID ${deckId} not found`);
    }

    // Verify course ownership
    await this.coursesService.findOne(deck.courseId, userId);

    return `${deck.course.name}/${deck.name}`;
  }

  /**
   * Get the path for a quiz
   */
  private async getQuizPath(quizId: string, userId: string): Promise<string> {
    const quiz = await this.chatMessagesRepository.manager.findOne(Quiz, {
      where: { id: quizId },
      relations: ['course'],
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with ID ${quizId} not found`);
    }

    // Verify course ownership
    await this.coursesService.findOne(quiz.courseId, userId);

    return `${quiz.course.name}/${quiz.title}`;
  }

  /**
   * Get the path for a quiz question
   */
  private async getQuestionPath(
    questionId: string,
    userId: string,
  ): Promise<string> {
    const question = await this.chatMessagesRepository.manager.findOne(
      QuizQuestion,
      {
        where: { id: questionId },
        relations: ['quiz', 'quiz.course'],
      },
    );

    if (!question) {
      throw new NotFoundException(`Question with ID ${questionId} not found`);
    }

    // Verify course ownership
    await this.coursesService.findOne(question.quiz.courseId, userId);

    // Find the position of this question in the quiz
    const questions = await this.chatMessagesRepository.manager.find(
      QuizQuestion,
      {
        where: { quizId: question.quizId },
        order: { createdAt: 'ASC' },
      },
    );

    const position = questions.findIndex((q) => q.id === questionId) + 1;

    return `${question.quiz.course.name}/${question.quiz.title}/Question ${position}`;
  }

  /**
   * Get the path for a chat session
   */
  private async getChatSessionPath(
    sessionId: string,
    userId: string,
  ): Promise<string> {
    const session = await this.findSessionById(sessionId, userId);

    if (!session) {
      throw new NotFoundException(
        `Chat session with ID ${sessionId} not found`,
      );
    }

    return `Chat: ${session.name || 'Untitled Session'}`;
  }

  async updateSessionContext(
    id: string,
    userId: string,
    fileIds: string[],
  ): Promise<ChatSession> {
    const session = await this.findSessionById(id, userId);

    // Validate that files exist and belong to the user
    if (fileIds && fileIds.length > 0) {
      await Promise.all(
        fileIds.map((fileId) => this.filesService.findOne(fileId, userId)),
      );
    }

    session.contextFileIds = fileIds;
    return this.chatSessionsRepository.save(session);
  }

  async deleteSession(id: string, userId: string): Promise<void> {
    const session = await this.findSessionById(id, userId);

    // Delete all messages in the session
    if (session.messages.length > 0) {
      await this.chatMessagesRepository.remove(session.messages);
    }

    // Delete the session
    await this.chatSessionsRepository.remove(session);
  }
}
