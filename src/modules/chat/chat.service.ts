import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
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
import { Course } from '../../entities/course.entity';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { QuizzesService } from '../quizzes/quizzes.service';

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
  
  async createSession(userId: string, fileIds: string[] = [], name?: string): Promise<ChatSession> {
    // Validate that files exist and belong to the user if fileIds provided
    if (fileIds && fileIds.length > 0) {
      await Promise.all(
        fileIds.map(fileId => this.filesService.findOne(fileId, userId))
      );
    }
    
    // Create a new chat session with provided name or a default one
    const session = this.chatSessionsRepository.create({
      name: name || `New Chat ${new Date().toLocaleString()}`,
      contextFileIds: fileIds,
      userId,
    });
    
    return this.chatSessionsRepository.save(session);
  }
  
  async updateSession(id: string, userId: string, updateDto: { name?: string }): Promise<ChatSession> {
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
    let fileContents: Array<{ id: string; name: string; content: string; type: string; originalName: string }> = [];
    let newFileContents: Array<{ id: string; name: string; content: string; type: string; originalName: string }> = [];
    let flashCardDecksContents: Array<{ id: string; name: string; fileIds: string[]; flashcards: Array<{ id: string; front: string; back: string }> }> = [];
    let quizzesContents: Array<{ id: string; name: string; fileIds: string[]; questions: Array<{ id: string; question: string; answer: string }> }> = [];
    
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
        throw new Error(`Session with ID ${sessionId} not found or does not belong to user ${userId}`);
      }
      
      console.log(`Processing message for session ${sessionId}, user ${userId}`);
      
      // Setup session context
      sessionContext = {
        ...session,
        flashCardDeckIds,
        quizIds,
        previousSessionsIds,
        courseId,
        contextFileIds: [...new Set([...session.contextFileIds, ...fileIds])],
      };
    } catch (error) {
      console.error('Error processing message:', error);
      yield JSON.stringify({ error: 'Error processing your message: ' + error.message });
      return; // Exit the generator
    }

    // Simplified deck handling to avoid TypeScript errors
    if (sessionContext.flashCardDeckIds && sessionContext.flashCardDeckIds.length > 0) {
      try {
        // Process flashcard decks asynchronously and await all promises
        flashCardDecksContents = await Promise.all(
          sessionContext.flashCardDeckIds.map(async deckId => {
            const deck = await this.flashcardsService.findDeckById(deckId, userId);
            return {
              id: deck.id,
              name: deck.name,
              fileIds: deck.fileIds,
              flashcards: deck.flashcards.map(flashcard => ({
                id: flashcard.id,
                front: flashcard.front,
                back: flashcard.back,
              }))
            };
          })
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
          sessionContext.quizIds.map(async quizId => {
            const quiz = await this.quizzesService.findOne(quizId, userId);
            return {
              id: quiz.id,
              name: quiz.title,
              fileIds: quiz.fileIds,
              questions: quiz.questions.map(question => ({
                id: question.id,
                question: question.question,
                answer: question.correctAnswer,
              }))
            };
          })
        )
      } catch (error) {
        console.error('Error handling quizzes:', error);
      }
    }

    if (sessionContext.contextFileIds && sessionContext.contextFileIds.length > 0) {
      const files = await Promise.all(
        sessionContext.contextFileIds.map(fileId => this.filesService.findOne(fileId, userId))
      );
      
      fileContents = files.map(file => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }));
    }

    if (flashCardDecksContents.some(deck => deck.fileIds.length > 0)) {
      // Flatten the nested array of promises before awaiting
      const filePromises = flashCardDecksContents.flatMap(deck => 
        deck.fileIds.map(fileId => this.filesService.findOne(fileId, userId))
      );
      
      // Now await the flattened array of promises
      const files = await Promise.all(filePromises);
      
      // Process the resolved files
      fileContents = [...fileContents, ...files.map(file => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }))];

      fileIds = [...fileIds, ...files.map(file => file.id)];
    }

    if (quizzesContents.some(quiz => quiz.fileIds.length > 0)) {
      const filePromises = quizzesContents.flatMap(quiz => 
        quiz.fileIds.map(fileId => this.filesService.findOne(fileId, userId))
      );
      
      const files = await Promise.all(filePromises);
      
      fileContents = [...fileContents, ...files.map(file => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }))];

      fileIds = [...fileIds, ...files.map(file => file.id)];
    }
    
    if (folderIds && folderIds.length > 0) {
      const files = await Promise.all(
        folderIds.map(folderId => this.foldersService.findAllFilesRecursively(folderId, userId))
      );

      
      newFileContents = files.flat().map(file => ({
        id: file.id,
        name: file.name,
        content: file.content || 'Content not available',
        type: file.type.toString(), // Convert FileType enum to string
        originalName: file.originalName,
      }));

      fileIds = [...fileIds, ...files.flat().map(file => file.id)];
    }
    fileContents = [...fileContents, ...newFileContents]
    
    fileContents = fileContents.filter((value, index, self) => {
      const isDuplicate = self.findIndex(item => item.id === value.id) !== index;
      return !isDuplicate;
    });

    // If courseId is explicitly provided, always load all course content
    // This ensures the entire course is considered when a user explicitly selects a course
    if (sessionContext.courseId) {
      try {
        console.log('Loading all content for course:', sessionContext.courseId);
        const course = await this.coursesService.findAllContentOfOne(sessionContext.courseId, userId);
        if (course) {
          fileContents = [...fileContents, ...course.map(file => ({
            id: file.id,
            name: file.name,
            content: file.content,
            type: file.type,
            originalName: file.originalName,
          }))].filter((value, index, self) => {
            const isDuplicate = self.findIndex(item => item.id === value.id) !== index;
            return !isDuplicate;
          });

          fileIds = [...fileIds, ...course.map(file => file.id)];
        }
      } catch (error) {
        console.error('Error handling course:', error);
      }
    }

    fileIds = [...new Set(fileIds)];
    
    let extractedContent: Array<{ fileId: string; name: string; content: string; }> = [];
    const category = await this.aiService.userQueryCategorizer(content);
    if (content) {
      if (fileIds.length > 0) {
        if (category === 'SPECIFIC') {
          const searchResults = await this.aiService.semanticSearch(content, userId)
          extractedContent = [...extractedContent, ...searchResults.map(result => ({
            fileId: (result.fields as { fileId: string }).fileId,
            name: (result.fields as { name: string; chunk_text: string }).name,
            content: (result.fields as { name: string; chunk_text: string }).chunk_text
          }))]

          fileContents = []
        } else {
          fileContents = fileContents.slice(0, 4)
        }
      } else {
        if (category === 'SPECIFIC') {
          const searchResults = await this.aiService.semanticSearch(content, userId)
          extractedContent = [...extractedContent, ...searchResults.map(result => ({
            fileId: (result.fields as { fileId: string }).fileId,
            name: (result.fields as { name: string; chunk_text: string }).name,
            content: (result.fields as { name: string; chunk_text: string }).chunk_text
          }))]
        } else {
          fileContents = []
          extractedContent = []
        }
      }
    
      console.log('🎯 Chat Service: Starting sendMessage for session', sessionId);

      const extractedFileContentsStr = extractedContent.length > 0
        ? extractedContent.map(file => `File name: ${file.name}\nContent: ${file.content}\nFile Id: ${file.fileId}`).join('\n\n')
        : 'No extracted content from files provided for this message';

      // Convert array objects to strings for AI service
      const fileContentsStr = fileContents.length > 0
        ? fileContents.map(file => `File title: ${file.name}\nFile original name: ${file.originalName}\nContent: ${file.content}\nFile Id: ${file.id}`).join('\n\n')
        : 'No files context provided for this message';

      const flashCardDecksContentsStr = flashCardDecksContents.length > 0
        ? flashCardDecksContents.map(deck => `Flashcard deck name: ${deck.name}\nFlashcard deck id: ${deck.id}\nFile ids: ${deck.fileIds.length > 0 ? deck.fileIds.join(', ') : 'No files were used in creating this flashcard deck.'}\nFlashcards: \n${deck.flashcards.map(flashcard => `Id: ${flashcard.id}\nFront: ${flashcard.front}\nBack: ${flashcard.back}`).join('\n\n')}`).join('\n\n')
        : 'No flashcard decks context provided for this message';

      const quizzesContentsStr = quizzesContents.length > 0
        ? quizzesContents.map(quiz => `Quiz name: ${quiz.name}\nQuiz id: ${quiz.id}\nFile ids: ${quiz.fileIds.length > 0 ? quiz.fileIds.join(', ') : 'No files were used in creating this quiz.'}\nQuestions: \n${quiz.questions.map(question => `Id: ${question.id}\nQuestion: ${question.question}\nAnswer: ${question.answer}`).join('\n\n')}`).join('\n\n')
        : 'No quizzes context provided for this message';

      console.log('📝 Chat Service: Converted content arrays to strings');
      console.log(`📊 Chat Service: fileContentsStr length: ${fileContentsStr.length}`);
      console.log(`📊 Chat Service: flashCardDecksContentsStr length: ${flashCardDecksContentsStr.length}`);
      console.log(`📊 Chat Service: quizzesContentsStr length: ${quizzesContentsStr.length}`);
      console.log(`📊 Chat Service: extractedFileContentsStr length: ${extractedFileContentsStr.length}`);

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
        where: { id: userMessage.id }
      });
      
      if (!savedMessage || savedMessage.chatSessionId !== sessionId) {
        console.error('Message not properly linked to session:', {
          messageId: userMessage.id,
          expectedSessionId: sessionId,
          actualSessionId: savedMessage?.chatSessionId
        });
      }

      // Get all messages for context
      updatedSession = await this.findSessionById(sessionId, userId);
      messages = updatedSession.messages || [];
      
      // If this is the first message, use it to generate a name for the session
      if (messages.length === 1) {
        console.log(`Generating name for session ${sessionId} based on first message`);
        await this.generateSessionName(updatedSession, content, userId);
      }

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
          console.log(`📥 Chat Service: Received chunk ${chunkIndex}, length: ${chunk.length}`);
          console.log(`📥 Chat Service: Chunk ${chunkIndex} content: "${chunk}"`);
          
          const beforeLength = streamedContent.length;
          streamedContent += chunk;
          const afterLength = streamedContent.length;
          
          console.log(`📊 Chat Service: Added chunk ${chunkIndex}. Before: ${beforeLength}, After: ${afterLength}, Expected: ${beforeLength + chunk.length}`);
          
          if (afterLength !== beforeLength + chunk.length) {
            console.error(`❌ Chat Service: CHARACTER LOSS DETECTED! Expected ${beforeLength + chunk.length}, got ${afterLength}`);
          }
          
          yield chunk;
          console.log(`✅ Chat Service: Yielded chunk ${chunkIndex} to frontend`);
        } else {
          console.log(`⚠️ Chat Service: Received empty chunk ${chunkIndex}`);
        }
      }

      console.log(`🏁 Chat Service: Finished processing ${chunkIndex} chunks`);
      console.log(`📊 Chat Service: Final streamedContent length: ${streamedContent.length}`);
      console.log(`📄 Chat Service: Final streamedContent preview: "${streamedContent.substring(0, 200)}..."`);

      // Extract citations from the complete streamed content
      console.log('🔍 Chat Service: Starting citation extraction');
      const citations: any[] = [];
      const citationRegex = /\[REF\]([\s\S]*?)\[\/REF\]/gs;
      const citationMatches = streamedContent.match(citationRegex) || [];

      console.log(`🔗 Chat Service: Found ${citationMatches.length} citation matches`);

      for (const match of citationMatches) {
        try {
          // Extract just the content between [REF] and [/REF] tags
          const contentMatch = match.match(/\[REF\]([\s\S]*?)\[\/REF\]/i);
          if (contentMatch && contentMatch[1]) {
            const jsonContent = contentMatch[1].trim();
            console.log(`🔗 Chat Service: Parsing citation JSON: "${jsonContent}"`);
            const citation = JSON.parse(jsonContent);
            citations.push(citation);
            console.log(`✅ Chat Service: Successfully parsed citation:`, citation);
          }
        } catch (e) {
          console.error('❌ Chat Service: Failed to parse citation JSON:', e);
          console.log('❌ Chat Service: Problematic content:', match);
        }
      }

      // Ensure we have valid content
      const finalContent = streamedContent || 'Sorry, I encountered an error while processing your request.';

      console.log(`💾 Chat Service: About to save message with content length: ${finalContent.length}`);
      console.log(`💾 Chat Service: About to save content preview: "${finalContent.substring(0, 200)}..."`);

      // Additional safety: ensure citations are valid to prevent errors
      const validCitations = Array.isArray(citations) ? citations.filter(citation => {
        try {
          // Basic validation - ensure it has required properties
          return citation && typeof citation === 'object' && 
                (citation.type === 'file' || 
                  citation.type === 'flashcardDeck' || 
                  citation.type === 'quiz') && 
                citation.id;
        } catch (e) {
          console.warn('⚠️ Chat Service: Filtering out invalid citation');
          return false;
        }
      }) : [];

      console.log(`💾 Chat Service: Saving ${validCitations.length} valid citations`);

      // Create AI message with the final content and citations
      const aiMessage = this.chatMessagesRepository.create({
        role: MessageRole.AI,
        content: finalContent, 
        citations: validCitations,
        chatSessionId: sessionId,
      });

      await this.chatMessagesRepository.save(aiMessage);
      console.log(`✅ Chat Service: Successfully saved AI message with ID: ${aiMessage.id}`);

      return { message: userMessage, aiResponse: aiMessage };
    } else {
      throw new BadRequestException('Empty user message');
    }
  }

  private async generateSessionName(session: ChatSession, firstMessage: string, userId: string): Promise<void> {
    try {
      // Make sure we have a valid session
      if (!session || !session.id) {
        console.error('Cannot generate session name: Invalid session', { sessionId: session?.id });
        return;
      }
      
      try {
        let sessionName = '';
        
        try {
          sessionName = await this.aiService.generateSessionName(firstMessage);
        } catch (aiError) {
          const date = new Date();
          sessionName = `Chat from ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
          console.log('Using fallback session name due to AI error:', aiError);
        }
        
        await this.chatSessionsRepository
          .createQueryBuilder()
          .update()
          .set({ name: sessionName })
          .where('id = :id', { id: session.id })
          .andWhere('userId = :userId', { userId })
          .execute();
          
        console.log(`Updated session name to "${sessionName}" for session ${session.id}`);
      } catch (updateError) {
        console.error('Failed to update session name:', updateError);
      }
    } catch (error) {
      console.error('Error generating session name:', error);
    }
  }
  
  /**
   * Get the full path for reference based on its type
   * @param referenceType Type of the reference (file, flashcard, quiz, chat)
   * @param referenceId ID of the reference
   * @param userId ID of the user
   * @returns The full path as a string
   */
  async getReferencePathById(referenceType: string, referenceId: string, userId: string): Promise<string> {
    try {
      switch (referenceType) {
        case 'file':
          // First, try to find the file using our enhanced lookup method
          try {
            console.log(`Getting file using enhanced lookup for ID: ${referenceId}`);
            const file = await this.filesService.findOneById(referenceId, userId);
            if (file) {
              // If we found the file, now get its path
              console.log(`File found, getting path for file ID: ${file.id}`);
              return this.filesService.getFilePath(file.id, userId);
            }
          } catch (error) {
            console.error(`Enhanced file lookup failed for ${referenceId}, falling back to direct path lookup:`, error);
            // Fall back to direct path lookup
            return this.filesService.getFilePath(referenceId, userId);
          }
        case 'quiz':
          return await this.getQuizPath(referenceId, userId);
        case 'flashcardDeck':
          return await this.getDeckPath(referenceId, userId);
        default:
          throw new BadRequestException(`Invalid reference type: ${referenceType}`);
      }
    } catch (error) {
      console.error(`Error in getReferencePathById for ${referenceType}:${referenceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the path for a flashcard
   */
  private async getFlashcardPath(flashcardId: string, userId: string): Promise<string> {
    // Get the flashcard with its related deck and course
    const flashcard = await this.chatMessagesRepository.manager.findOne(Flashcard, {
      where: { id: flashcardId },
      relations: ['deck', 'deck.course'],
    });
    
    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ID ${flashcardId} not found`);
    }
    
    // Verify course ownership
    await this.coursesService.findOne(flashcard.deck.courseId, userId);
    
    // Find the position of this flashcard in the deck
    const flashcards = await this.chatMessagesRepository.manager.find(Flashcard, {
      where: { deckId: flashcard.deckId },
      order: { createdAt: 'ASC' },
    });
    
    const position = flashcards.findIndex(f => f.id === flashcardId) + 1;
    
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
  private async getQuestionPath(questionId: string, userId: string): Promise<string> {
    const question = await this.chatMessagesRepository.manager.findOne(QuizQuestion, {
      where: { id: questionId },
      relations: ['quiz', 'quiz.course'],
    });
    
    if (!question) {
      throw new NotFoundException(`Question with ID ${questionId} not found`);
    }
    
    // Verify course ownership
    await this.coursesService.findOne(question.quiz.courseId, userId);
    
    // Find the position of this question in the quiz
    const questions = await this.chatMessagesRepository.manager.find(QuizQuestion, {
      where: { quizId: question.quizId },
      order: { createdAt: 'ASC' },
    });
    
    const position = questions.findIndex(q => q.id === questionId) + 1;
    
    return `${question.quiz.course.name}/${question.quiz.title}/Question ${position}`;
  }
  
  /**
   * Get the path for a chat session
   */
  private async getChatSessionPath(sessionId: string, userId: string): Promise<string> {
    const session = await this.findSessionById(sessionId, userId);
    
    if (!session) {
      throw new NotFoundException(`Chat session with ID ${sessionId} not found`);
    }
    
    return `Chat: ${session.name || 'Untitled Session'}`;
  }

  async updateSessionContext(id: string, userId: string, fileIds: string[]): Promise<ChatSession> {
    const session = await this.findSessionById(id, userId);
    
    // Validate that files exist and belong to the user
    if (fileIds && fileIds.length > 0) {
      await Promise.all(
        fileIds.map(fileId => this.filesService.findOne(fileId, userId))
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
