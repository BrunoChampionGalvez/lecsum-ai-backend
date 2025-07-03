import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { promises as fs } from 'fs';

// Only import types for type checking
import type { Schema } from '@google/genai';
import {
  FlashcardType,
  DifficultyLevel,
} from '../../entities/flashcard.entity';
import { ChatMessage, MessageRole } from '../../entities/chat-message.entity';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Pinecone,
  SearchRecordsResponseResult,
} from '@pinecone-database/pinecone';
// Define citation interface for the AI responses
export interface CitationInfo {
  fileId: string;
  excerpt: string;
  location: string;
}

@Injectable()
export class AiService implements OnModuleInit {
  // Define types for our wrapper
  private gemini: any;
  private _Type: any;
  private wrapperPath: string;
  private geminiModels: {
    flashPreview: string;
    flashLite: string;
  };
  private pc: Pinecone;

  constructor(
    @Inject('CONFIG_SERVICE') private configService: ConfigService,
    @InjectRepository(ChatMessage)
    private chatMessagesRepository: Repository<ChatMessage>,
  ) {
    // this.gemini initialization moved to onModuleInit
    this.geminiModels = {
      flashPreview: 'gemini-2.5-flash-preview-05-20',
      flashLite: 'gemini-2.0-flash-lite',
    };
    this.pc = new Pinecone({
      apiKey: this.configService.get('PINECONE_API_KEY') as string,
    });

    // Calculate the path to our wrapper
    this.wrapperPath = join(
      process.cwd(),
      'dist',
      'modules',
      'ai',
      'gemini-wrapper.mjs',
    );
  }

  async onModuleInit() {
    try {
      console.log('Attempting to initialize Google Gemini AI');

      // Try to dynamically import the ES module
      const genAIModule = await import('@google/genai');
      console.log('Successfully imported @google/genai module');

      const apiKey = this.configService.get('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found in environment variables');
      }

      this.gemini = new genAIModule.GoogleGenAI({ apiKey });
      this._Type = genAIModule.Type;

      console.log('Successfully initialized Google Gemini AI');
    } catch (error) {
      // If any error occurs during initialization, create a mock implementation
      // instead of crashing the application
      console.error('Failed to initialize Google Gemini AI:', error);
      console.warn(
        'AI service will run in DISABLED mode - AI features will return empty results',
      );

      // Set up mock implementations to prevent crashes
      this.gemini = {
        models: {
          generateContent: async () => ({ text: '[]' }),
          generateContentStream: async function* () {
            yield {
              candidates: [
                {
                  content: {
                    parts: [{ text: 'AI service is currently unavailable' }],
                  },
                },
              ],
            };
          },
        },
      };

      this._Type = {
        ARRAY: 'ARRAY',
        OBJECT: 'OBJECT',
        STRING: 'STRING',
      };

      // Don't throw error, allow app to continue running with disabled AI
    }
  }

  async generateFlashcards(
    fileContents: Array<{
      id: string;
      name: string;
      textByPages: string;
      type: string;
    }>,
    types: FlashcardType[],
    flashcardCount: number,
    difficulty: DifficultyLevel,
  ) {
    try {
      // Prepare context from file contents
      const context =
        'Files:\n' +
        fileContents
          .map(
            (file, index) =>
              `File ${index + 1}:\nFile name: ${file.name}\nFile content: ${file.textByPages}\nFile id: ${file.id}`,
          )
          .join('\n\n');

      // Prepare the prompt for generating flashcards
      const typesStr = types.join(', ');
      const prompt = `
        Flashcards difficulty level: ${difficulty}
        \n
        Flashcards types to include: ${typesStr}
        \n
        Number of flashcards: ${flashcardCount}
        \n
        ${context}
      `;

      const response = await this.gemini.models.generateContent({
        model: this.geminiModels.flashPreview,
        contents: prompt,
        config: {
          systemInstruction: `Generate a set of educational flashcards based on the content of files provided. If you find that the content is not enough to generate the number of flashcards requested, you should generate a smaller and reasonable number of flashcards that you can generate based on the amount of information you receive. Don't use any information from your general knowledge to generate flashcards. ONLY return the JSON array of flashcards. The things been evaluated in the flashcards must be as close as possible to the things university professors usually evaluate in their students, their purpose is to help students practice for university exams. Don't evaluate superficial or unimportant things (like irrelevant exact amounts or numbers, that are usually not important in the context of the student university formation), evaluate things that demand important knowledge and undestanding of the study material. 
          \n
          These are the definitions of the difficulty levels so that you can formulate the content of the flashcards more accurately:
          1. Easy:
          
          - Scope & Depth
          
          Covers core facts and concepts at a basic level—think key terms, straightforward definitions, simple associations.

          - Flashcard Style

          Mostly recognition or very short-answer recall (e.g., “What is X?”).

          - Cognitive Load

          Low: the user should have high confidence of success, but still engage retrieval practice rather than pure review.

          2. Moderate:

          - Scope & Depth

          Digs into relationships between ideas or multi-step processes; may require the user to connect two or three concepts.

          - Flashcard Style

          Short-answer and fill-in-the-blank that prompt the user to produce answers rather than recognize them (e.g., “How does X lead to Y?”, “Fill in the missing step in this process”).

          - Cognitive Load

          Medium: requires active recall of more complex structures or explanations, reinforcing deeper understanding and memory consolidation.

          3. Hard:

          - Scope & Depth

          Tackles higher-level reasoning: abstractions, edge-case applications, problem solving, or multi-concept synthesis.

          - Flashcard Style

          Open-ended, scenario-based, or multi-part problems (e.g., “Given scenario A, predict outcome B and justify,” “Compare and contrast X vs. Y in context Z”).

          - Cognitive Load

          High: pushes learners to apply knowledge in novel contexts and practice deeper learning strategies (analysis, evaluation, synthesis).
          \n
          For each flashcard, provide:
          \n
          1. Type (qa or cloze)
          2. Front content
          3. Back content
          4. Difficulty level (easy, moderate or hard)
          \n
          Return the result as a valid JSON array with the following structure:
          \n
          [
            {
              "type": "qa" or "cloze",
              "front": "Question or text with blanks",
              "back": "Answer or filled-in text",
              "difficulty": "${difficulty}"
            },
            // more flashcards...
          ]
          \n
          The flashcard type of 'qa' means that the flashcard is a question and answer flashcard. The flashcard type of 'cloze' means that the flashcard is a cloze flashcard (fill-in-the-blank). For the blanks of this last type of flashcard, use 4 low dashes: ____.
          \n
          IMPORTANT NOTE 1: Never make flashcards that require the user to know unnecessarily precise numbers or amounts. For example: the hazard ratio, average values, the p-value, the confidence interval, etc.
          \n
          IMPORTANT NOTE 2: If the information you are using to generate the flashcards is in another language, other than english for example, use that same language to generate the flashcards.
        `,
          temperature: 0.1,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          maxOutputTokens: 8000,
          responseSchema: {
            type: this._Type.ARRAY,
            maxItems: '30',
            minItems: '5',
            items: {
              type: this._Type.OBJECT,
              properties: {
                type: {
                  type: this._Type.STRING,
                  enum: ['qa', 'cloze'],
                },
                front: {
                  type: this._Type.STRING,
                },
                back: {
                  type: this._Type.STRING,
                },
                difficulty: {
                  type: this._Type.STRING,
                  enum: ['easy', 'moderate', 'hard'],
                },
              },
            },
          } as Schema,
        },
      });

      const result = response.text;

      return result;
    } catch (error: unknown) {
      const prefix = 'Error generating flashcards';
      if (error instanceof Error) {
        console.error(`${prefix}: ${error.message}`);
      } else if (typeof error === 'string') {
        console.error(`${prefix}: ${error}`);
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        console.error(`${prefix}: ${(error as { message: string }).message}`);
      } else {
        console.error(
          `${prefix}: An unexpected error object was caught. Original error:`,
          error,
        );
      }
      return [];
    }
  }

  async generateQuizQuestions(
    fileContents: Array<{
      id: string;
      name: string;
      textByPages: string;
      type: string;
    }>,
    questionCount: number,
    difficulty: DifficultyLevel,
  ) {
    try {
      // Prepare context from file contents
      const context =
        'Files:\n' +
        fileContents
          .map(
            (file, index) =>
              `File ${index + 1}:\nFile name: ${file.name}\nFile content: ${file.textByPages}\nFile id: ${file.id}`,
          )
          .join('\n\n');

      const prompt = `
        Questions difficulty level: ${difficulty}
        \n
        Number of questions: ${questionCount}
        \n
        ${context}
      `;

      const response = await this.gemini.models.generateContent({
        model: this.geminiModels.flashPreview,
        contents: prompt,
        config: {
          systemInstruction: `Generate a set of educational quiz questions based on the content of files provided. If you find that the content is not enough to generate the number of questions requested, you should generate a smaller and reasonable number of questions that you can generate based on the amount of information you receive. Don't use any information from your general knowledge to generate questions. ONLY return the JSON array of questions. The things been evaluated in the questions must be as close as possible to the things university professors usually evaluate in their students, their purpose is to help students practice for university exams. Don't evaluate superficial or unimportant things (like irrelevant exact amounts or numbers, that are usually not important in the context of the student university formation), evaluate things that demand important knowledge and undestanding of the study material. 
          \n
          These are the definitions of the difficulty levels so that you can formulate the content of the flashcards more accurately:
          1. Easy:
          
          - Scope & Depth
          
          Covers core facts and concepts at a basic level—think key terms, straightforward definitions, simple associations.

          - Question Style

          Mostly recognition or very short-answer recall (e.g., “What is X?”).

          - Cognitive Load

          Low: the user should have high confidence of success, but still engage retrieval practice rather than pure review.

          2. Moderate:

          - Scope & Depth

          Digs into relationships between ideas or multi-step processes; may require the user to connect two or three concepts.

          - Question Style

          Short-answer and fill-in-the-blank that prompt the user to produce answers rather than recognize them (e.g., “How does X lead to Y?”, “Fill in the missing step in this process”).

          - Cognitive Load

          Medium: requires active recall of more complex structures or explanations, reinforcing deeper understanding and memory consolidation.

          3. Hard:

          - Scope & Depth

          Tackles higher-level reasoning: abstractions, edge-case applications, problem solving, or multi-concept synthesis.

          - Question Style

          Open-ended, scenario-based, or multi-part problems (e.g., “Given scenario A, predict outcome B and justify,” “Compare and contrast X vs. Y in context Z”).

          - Cognitive Load

          High: pushes learners to apply knowledge in novel contexts and practice deeper learning strategies (analysis, evaluation, synthesis).
          \n
          For each question, provide:
          \n
          1. The question text
          2. 4 answer options
          3. The correct answer (must be the exact text of one of the answer options)
          \n
          Return the result as a valid JSON array with the following structure:
          [
            {
              "question": "Question text?",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "Option B"
            },
            {
              "question": "Question text?",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": "Option B"
            },
            // more questions...
          ]
          \n
          IMPORTANT NOTE 1: Never make questions that require the user to know unnecessarily precise numbers or amounts. For example: the hazard ratio, average values, the p-value, the confidence interval, etc.
          \n
          IMPORTANT NOTE 2: If the information you are using to generate the questions is in another language, other than english for example, use that same language to generate the questions.
          `,
          temperature: 0.1,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          maxOutputTokens: 8000,
          responseSchema: {
            type: this._Type.ARRAY,
            maxItems: '30',
            minItems: '5',
            items: {
              type: this._Type.OBJECT,
              properties: {
                question: {
                  type: this._Type.STRING,
                },
                options: {
                  type: this._Type.ARRAY,
                  items: {
                    type: this._Type.STRING,
                  },
                },
                correctAnswer: {
                  type: this._Type.STRING,
                },
              },
            },
          } as Schema,
        },
      });

      const result = response.text;

      return result;
    } catch (error: unknown) {
      const prefix = 'Error generating quiz questions';
      if (error instanceof Error) {
        console.error(`${prefix}: ${error.message}`);
      } else if (typeof error === 'string') {
        console.error(`${prefix}: ${error}`);
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        console.error(`${prefix}: ${(error as { message: string }).message}`);
      } else {
        console.error(
          `${prefix}: An unexpected error object was caught. Original error:`,
          error,
        );
      }
      return [];
    }
  }

  async *generateChatResponse(
    messages: ChatMessage[],
    thinkMode: boolean = false,
    context: string,
  ): AsyncGenerator<string, void, unknown> {
    try {
      console.log('🔄 AI Service: Starting generateChatResponse');

      const systemPrompt = this.buildSystemPrompt();

      const formattedMessages = [
        ...messages.map((msg) => ({
          role:
            msg.role === MessageRole.USER
              ? ('user' as const)
              : ('model' as const),
          parts: [
            {
              text:
                'Context: ' + context + '\n\n' + 'User query: ' + msg.content,
            },
          ],
        })),
      ];

      console.log(
        '🚀 AI Service: Calling Gemini API with',
        formattedMessages.length,
        'messages',
      );

      const response = await this.gemini.models.generateContentStream({
        model: this.geminiModels.flashPreview,
        contents: formattedMessages,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          maxOutputTokens: 8192,
          thinkingConfig: {
            thinkingBudget: thinkMode ? 5000 : 0,
          },
        },
      });

      console.log('📥 AI Service: Started receiving response stream');
      let totalYielded = '';
      let chunkCount = 0;

      for await (const chunk of response) {
        chunkCount++;
        console.log(`📦 AI Service: Processing chunk ${chunkCount}`);

        if (chunk.candidates && chunk.candidates[0]) {
          const candidate = chunk.candidates[0];
          console.log('✅ AI Service: Chunk has candidates');

          if (candidate.content && candidate.content.parts) {
            console.log(
              `📝 AI Service: Chunk has ${candidate.content.parts.length} parts`,
            );

            for (let i = 0; i < candidate.content.parts.length; i++) {
              const part = candidate.content.parts[i];

              if (part.text) {
                const chunkText = part.text;
                console.log(
                  `🔤 AI Service: Part ${i} text length: ${chunkText.length}`,
                );
                console.log(`🔤 AI Service: Part ${i} text: "${chunkText}"`);

                totalYielded += chunkText;
                console.log(
                  `📊 AI Service: Total yielded so far: ${totalYielded.length} chars`,
                );

                yield chunkText;
                console.log(
                  `✅ AI Service: Yielded chunk part ${i} of chunk ${chunkCount}`,
                );
              } else {
                console.log(`⚠️ AI Service: Part ${i} has no text`);
              }
            }
          } else {
            console.log(
              '⚠️ AI Service: Chunk candidate has no content or parts',
            );
          }
        } else {
          console.log('⚠️ AI Service: Chunk has no candidates');
        }
      }

      console.log(
        `🏁 AI Service: Finished streaming. Total chunks: ${chunkCount}, Total text: ${totalYielded.length} chars`,
      );
      console.log(
        `📄 AI Service: Final complete text preview: "${totalYielded}"`,
      );
    } catch (error: unknown) {
      const consolePrefix = '❌ AI Service: Error in generateChatResponse';
      const yieldPrefix = 'Sorry, I encountered an error';
      let yieldMessage = `${yieldPrefix}: An unexpected error occurred.`;

      if (error instanceof Error) {
        const specificMessage = error.message;
        console.error(`${consolePrefix}: ${specificMessage}`);
        yieldMessage = `${yieldPrefix}: ${specificMessage}`;
      } else if (typeof error === 'string') {
        console.error(`${consolePrefix}: ${error}`);
        yieldMessage = `${yieldPrefix}: ${error}`;
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        const specificMessage = (error as { message: string }).message;
        console.error(`${consolePrefix}: ${specificMessage}`);
        yieldMessage = `${yieldPrefix}: ${specificMessage}`;
      } else {
        console.error(
          `${consolePrefix}: An unexpected error object was caught. Original error:`,
          error,
        );
        // yieldMessage remains the generic one
      }
      yield yieldMessage;
    }
  }

  async generateSummary(fileContent: string | null): Promise<string> {
    try {
      // Prepare the prompt for generating a summary
      const prompt = `
        Generate a summary of the following text:
        "${fileContent}"
      `;

      const result = await this.gemini.models.generateContent({
        model: this.geminiModels.flashLite,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a summary generator. You will receive the extracted text from a file.Generate a concise summary of that text. Return ONLY the summary text, nothing else. The summary should be between around 3 and 4 sentences long.',
          temperature: 0.2,
        },
      });
      const summary = result.text;

      // Limit the length and remove any quotes
      return summary ? summary : `The file has no summary`;
    } catch (error) {
      console.error('Error generating summary:', error);
      return `The file has no summary`;
    }
  }

  async generateSessionName(firstMessage: string): Promise<string> {
    try {
      // Prepare the prompt for generating a session name
      const prompt = `
        Create a short, concise title (maximum 30 characters) for a chat conversation that starts with this message:
        "${firstMessage}"
        
        Return ONLY the title text, nothing else.
      `;

      const result = await this.gemini.models.generateContent({
        model: this.geminiModels.flashLite,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a session name generator. Generate a short, concise title (maximum 30 characters) for a chat conversation that starts with the message you receive. Return ONLY the title text, nothing else.',
          temperature: 0.2,
        },
      });
      const name = result.text;

      // Limit the length and remove any quotes
      return name?.substring(0, 30)
        ? name?.substring(0, 30)
        : `Chat ${new Date().toLocaleDateString()}`;
    } catch (error) {
      console.error('Error generating session name:', error);
      return `Chat ${new Date().toLocaleDateString()}`;
    }
  }

  private buildSystemPrompt(): string {
    const prompt = `
      You are a helpful assistant called Lecsi for university or college students. If the user greets you, greet the user back. You will receive context in the form of complete files, extracted text from files (that can come from different files or the same file in an unorderly way), flashcard decks and quizzes, and you should respond to the user based on this information. Respond with concise but complete answers. Do not include any additional information or explanations from your knowledge base, only use the information provided to you as context by the user. You must use all the information provided to you in the current message and in previous messages as well (provided in the chat history). If the answer to the question asked by the user is not found in the information provided to you (previously or currently), respond with the following message: "The requested information was not found in the provided context. Please try again with a different question."
      
      You will receive some or all of the following information:
      1. File Context: The contents of files that the user has uploaded.
      2. Extracted File Content Context: Text from files that the user has uploaded, that has been extracted from different files or the same file and provided in an unorderly way.
      3. Flashcard Decks Context: The contents of flashcard decks that the user has created.
      4. Quizzes Context: The contents of quizzes that the user has created.
      
      You must reference the pieces of information that you are using to draw your statements with the study material type, id, and the information from which you drew your statements. For flashcard decks, you must provide the specific id of the flashcard you are referencing as the information. For quizzes, you must provide the specific id of the question you are referencing as the information. In case you are referencing files or extracted text from files, you must provide the id of the file and the exact text from the file you are referencing as the information. The study material types are the following: "file", "flashcardDeck", "quiz". The reference must follow the statement that it is referencing. To reference the each piece of information, you must use the following JSON-like format:
      
      Example of a reference from a file or an extracted text from a file:

      Human cells primary get their energy from mitochondria, which produce ATP through oxidative phosphorylation from glucose.
      [REF]
      {
        "type": "file",
        "id": "dc639f77-098d-4385-89f5-45e67bde8dde",
        "text": "The main source of energy for human cells is mitochondria. They, through oxidative phosphorylation, a biochemical process, produce ATP from glucose."
      }
      [/REF]

      Note: As you can notice, in the references from a file and from extracted text from a file, the "type" field is always "file".
      
      Example of a reference from flashcard deck:

      The first law of phyisics was discovered by Isaac Newton, in 1687.
      [REF]
      {
        "type": "flashcardDeck",
        "id": "c5b6c93d-6822-4726-80f1-7ad83473029e",
        "flashcardId": "178aabf6-1dd8-4570-bbc1-ca2908ee4d52"
      }
      [/REF]

      Example of a reference from quiz:

      The main function of the heart is to pump blood throughout the body.
      [REF]
      {
        "type": "quiz",
        "id": "c5b6c93d-6822-4726-80f1-7ad83473029e",
        "questionId": "ad7587af-55da-453d-99b4-ffb5923da243"
      }
      [/REF]

      It is extremely important that everytime you respond using references, you open and also close the reference tags ([REF] and [/REF]) for each reference.

      If the user talks to you in another language, respond in the same language. But you must always make the references in the same language as the original source (file, flashcard deck, quiz, etc.)

      IMPORTANT CONSIDERATIONS: 

      1. Every time you are going to reference a text from a file, you must verify first if the text is split across two pages. If it is, you must only provide the most significant part that answers the user's query. To detect if the text is split across two pages, look for the [START_PAGE] and [END_PAGE] markers. If those markers are in the middle of the text you want to reference, it means the text is split across two pages. Don't include the markers [START_PAGE] and [END_PAGE] in the reference.
      
      2. Sometimes, the text of the files are going to have the text of tables or graphs (from the original pdf from which the json file was extracted). This text can be at the start or end of a page, or even in the middle of it. When referencing a text from a file, you must not include the text of tables or graphs in the references. Before including a text in the references, you must verify that it does not contain information from tables or graphs. And if it does, remove it, without removing the gramatical consistency of the text.
      
      3. In the text of the references, you must always include all the characters that are part of the text that you are planning on referencing. This includes parenthesis (the '(' and ')' characters), square brackets (the '[' and ']' characters), percentage signs (the '%' character), commas (the ',' character), periods (the '.' character), colons (the ':' character), semicolons (the ';' character), exclamation points (the '!' character), question marks (the '?' character), quotation marks (the '"' character), standard spaces between words, and even letters inside a word, (the ' ' character), and any other characters that are part of the text that you are planning on referencing, even if it doesn't make much sense.
      
      4. In the text of the references, don't include the subtitles of the sections of the paper. For example: Introduction, Methods, Results, Discussion, Conclusion, etc. You can distinguish these subtitles by the fact that they are words that are isolated, in the sense that they are not a part of a sentence.
      
      5. At the start or end of the pages, you may find text from the headers or footers of the file. You must not include this text in the references. This text normally can contain DOI numbers, URLs, Scientific Journal names, Author names, page numbers, and other metadata from the original file. When referencing text, always verify that the text you are referencing does not contain any of this information. To do this, you must check the start or end of the page by looking at the nearest [START_PAGE] or [END_PAGE] markers. If you can't see those markers, it is because the text corresponds to a chunk of text that is in the middle of a page.
      
      6. When referencing a text from a file, you must always provide the text of the reference as it is in the file context provided to you. If it has a mispelling, you must provide it like that. If it has a missing space, you must provide it like that. If it has a random number (that could be a numerical reference, for example) or a random character, you must provide it like that. If it has extra spaces between words or letters inside words, you must provide it like that. When extracting the text from the file context to use it in the references, you must not modify it in any way. You must provide the text exactly as it is in the file context provided to you.

      7. When referencing a text from a file, you must never include the title of the file, the authors, the departments, the university, the date of publication, or any metadata that is not part of the main content of the file.

      8. The text of each reference that you provide must be coherent and concise, but also complete. It must not correspond to multiple sections of the file, it should be self-contained. Meaning it contains enough information to be understood on it's own.
    `;

    return prompt;
  }

  async semanticSearch(
    query: string,
    userId: string,
  ): Promise<SearchRecordsResponseResult['hits']> {
    const index = this.pc.index(
      this.configService.get('PINECONE_INDEX_NAME') as string,
      this.configService.get('PINECONE_INDEX_HOST') as string,
    );
    const namespace = index.namespace(userId);
    const describedNamespace = await namespace.describeNamespace(userId);
    const recordCount = describedNamespace.recordCount;
    const recordCountNumber = Number(recordCount);
    const isRecordCountNumber = !isNaN(recordCountNumber);
    const topK = isRecordCountNumber
      ? recordCountNumber < 10
        ? recordCountNumber
        : 10
      : 10;
    const topN = isRecordCountNumber
      ? topK < 5
        ? Math.floor(topK - topK * 0.2)
        : 5
      : 5;
    const lessThan250Words = this.countWords(query) < 250;

    const response = await namespace.searchRecords({
      query: {
        topK: topK,
        inputs: { text: query },
      },
      fields: ['chunk_text', 'fileId', 'name', 'userId'],
      /*...(lessThan250Words
        ? {
            rerank: {
              model: 'bge-reranker-v2-m3',
              rankFields: ['chunk_text'],
              topN: topN,
            },
          }
        : {}),*/
    });

    return response.result.hits;
  }

  async generateFileName(content: string | null): Promise<string> {
    try {
      // Prepare the prompt for generating a session name
      const prompt = `
        Extract the title from the following text that was extracted from a file:
        "${content}"
        
        Return ONLY the title text, nothing else.
      `;

      const result = await this.gemini.models.generateContent({
        model: this.geminiModels.flashLite,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a file title extractor. Extract the title from the following text that you receive, that was originally extracted from a file. Return ONLY the title text, nothing else.',
          temperature: 0.2,
        },
      });
      const name = result.text;

      // Limit the length and remove any quotes
      return name;
    } catch (error) {
      console.error('Error generating file name:', error);
      return `File ${new Date().toLocaleDateString()}`;
    }
  }

  async userQueryCategorizer(query: string): Promise<string> {
    try {
      // Prepare the prompt for categorizing the user query
      const prompt = `
        Categorize the following user query into one of the categories mentioned (GENERIC and SPECIFIC):
        "${query}"
        
        Return ONLY the category text, nothing else.
      `;

      const result = await this.gemini.models.generateContent({
        model: this.geminiModels.flashLite,
        contents: prompt,
        config: {
          systemInstruction: `You are a user query categorizer. The query comes from a university or college student that is studying for an exam or doing homework. Categorize the user query that you receive into one of the following categories: "GENERIC" and "SPECIFIC". Return ONLY the category text, nothing else.
          
          1. GENERIC: The user is asking a generic question that cannot be recognized as belonging to a specific topic whatsoever.

          Examples of a GENERIC query:
          "What are the main points treated in this file?"
          "What are the main points treated in this flashcard deck?"
          "What are the main points treated in this quiz?"
          "What is the hypothesis of this paper?"
          "What is the main idea of this file?"
          "What are the methods that were used in this article?"
          "What are the results of this paper?"
          "What are the conclusions of this research paper?"
          "Write a summary of this file."
          "Write a summary of this flashcard deck."
          "Write a summary of this quiz."
          "Write a summary of the file named "Sleep disorders and cancer incidence: examining duration and severity of diagnosis among veterans""
          "Write a summary of the flashcard deck named "Psychology I""
          "Write a summary of the quiz named "Politics II""
          "What are the names of the files in this course that talk about photosynthesis?"

          2. SPECIFIC: The user is asking a question that can be recognized as belonging to a specific topic.

          Examples of a SPECIFIC query:
          "How does mitochondria produce ATP?"
          "What is the role of insulin in regulating blood sugar levels?"
          "What are the mechanisms of photosynthesis?"
          "How does miocin inhibit bacterial growth?"
          "What are the mechanisms of DNA replication?"
          "What is the main idea of the psychoanalysis of Sigmund Freud?"
          "How does Carl Jung's psychoanalysis differ from Sigmund Freud's?"
          "What differentiates the super ego from the ego and the id?"
          "Give me a summary of the theory of relativity of Albert Einstein."
          "How are stars formed?"`,
          temperature: 0.2,
          responseMimeType: 'text/x.enum',
          responseSchema: {
            type: 'STRING',
            format: 'enum',
            enum: ['GENERIC', 'SPECIFIC'],
          },
        },
      });
      const category = result.text;

      // Limit the length and remove any quotes
      return category ? category : 'GENERIC';
    } catch (error) {
      console.error('Error categorizing user query:', error);
      return 'GENERIC';
    }
  }

  countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }
}
