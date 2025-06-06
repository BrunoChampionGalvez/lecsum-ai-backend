import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { GenerateContentParameters, GoogleGenAI } from "@google/genai";
import { FlashcardType, DifficultyLevel } from '../../entities/flashcard.entity';
import { ChatMessage, FileCitation, FlashcardDeckCitation, QuizCitation, MessageRole } from '../../entities/chat-message.entity';
import { ConfigService } from '@nestjs/config';
import { response, text } from 'express';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Pinecone, SearchRecordsResponseResult } from '@pinecone-database/pinecone';
// Define citation interface for the AI responses
export interface CitationInfo {
  fileId: string;
  excerpt: string;
  location: string;
}

enum UserQueryType {
  GENERIC = 'GENERIC',
  SPECIFIC = 'SPECIFIC'
}

@Injectable()
export class AiService {
  private gemini: GoogleGenAI;
  private geminiModels: {
    flashPreview: string;
    flashLite: string;
  };
  private pc: Pinecone;
  
  constructor(@Inject('CONFIG_SERVICE') private configService: ConfigService, @InjectRepository(ChatMessage) private chatMessagesRepository: Repository<ChatMessage>) {
    this.gemini = new GoogleGenAI({ apiKey: this.configService.get('GEMINI_API_KEY')});
    this.geminiModels = {
      flashPreview: "gemini-2.5-flash-preview-05-20",
      flashLite: "gemini-2.0-flash-lite"
    };
    this.pc = new Pinecone({ apiKey: this.configService.get('PINECONE_API_KEY') as string });
  }

  async generateFlashcards(
    fileContents: Array<{ id: string; name: string; content: string; type: string }>,
    types: FlashcardType[],
    flashcardCount: number,
    difficulty: DifficultyLevel
  ) {
    try {
      // Prepare context from file contents
      const context = 'Files:\n' + fileContents
        .map((file, index) => `File ${index + 1}:\nFile name: ${file.name}\nFile content: ${file.content}\nFile id: ${file.id}`)
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
          systemInstruction: `Generate a set of educational flashcards based on the content of files provided. If you find that the content is not enough to generate the number of flashcards requested, you should generate a smaller and reasonable number of flashcards that you can generate based on the amount of information you receive. Don\'t use any information from your general knowledge to generate flashcards. ONLY return the JSON array of flashcards. The things been evaluated in the flashcards must be as close as possible to the things university professors usually evaluate in their students, their purpose is to help students practice for university exams. Don't evaluate superficial or unimportant things (like irrelevant exact amounts or numbers, that are usually not important in the context of the student university formation), evaluate things that demand important knowledge and undestanding of the study material. For each flashcard, provide:
          \n
          1. Type (${typesStr})
          2. Front content
          3. Back content
          4. Difficulty level (${difficulty})
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
        `,
          temperature: 0.1,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          maxOutputTokens: 8000,
          responseSchema: {
            type: 'ARRAY',
            maxItems: 30,
            minItems: 5,
            items: {
              type: 'OBJECT',
              properties: {
                type: {
                  type: 'STRING',
                  enum: ['qa', 'cloze']
                },
                front: {
                  type: 'STRING'
                },
                back: {
                  type: 'STRING'
                },
                difficulty: {
                  type: 'STRING',
                  enum: ['easy', 'moderate', 'hard']
                }
              }
            }
          }
        }
      })

      const result = response.text

      return result
    } catch (error) {
      console.error('Error generating flashcards:', error);
      return [];
    }
  }

  async generateQuizQuestions(
    fileContents: Array<{ id: string; name: string; content: string; type: string }>,
    questionCount: number,
    difficulty: DifficultyLevel
  ) {
    try {
      // Prepare context from file contents
      const context = 'Files:\n' + fileContents
        .map((file, index) => `File ${index + 1}:\nFile name: ${file.name}\nFile content: ${file.content}\nFile id: ${file.id}`)
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
          systemInstruction: `Generate a set of educational quiz questions based on the content of files provided. If you find that the content is not enough to generate the number of questions requested, you should generate a smaller and reasonable number of questions that you can generate based on the amount of information you receive. Don\'t use any information from your general knowledge to generate questions. ONLY return the JSON array of questions. The things been evaluated in the questions must be as close as possible to the things university professors usually evaluate in their students, their purpose is to help students practice for university exams. Don't evaluate superficial or unimportant things (like irrelevant exact amounts or numbers, that are usually not important in the context of the student university formation), evaluate things that demand important knowledge and undestanding of the study material. For each question, provide:
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
          ]`,
          temperature: 0.1,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          maxOutputTokens: 8000,
          responseSchema: {
            type: 'ARRAY',
            maxItems: 30,
            minItems: 5,
            items: {
              type: 'OBJECT',
              properties: {
                question: {
                  type: 'STRING'
                },
                options: {
                  type: 'ARRAY',
                  items: {
                    type: 'STRING'
                  }
                },
                correctAnswer: {
                  type: 'STRING'
                }
              }
            }
          }
        }
      })

      const result = response.text

      return result
    } catch (error) {
      console.error('Error generating quiz questions:', error);
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
          role: msg.role === MessageRole.USER ? ('user' as const) : ('model' as const),
          parts: [{ text: 'Context: ' + context + '\n\n' + 'User query: ' + msg.content }],
        }))
      ];

      console.log('🚀 AI Service: Calling Gemini API with', formattedMessages.length, 'messages');

      const response = await this.gemini.models.generateContentStream({
        model: this.geminiModels.flashPreview,
        contents: formattedMessages,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          maxOutputTokens: 8192,
          thinkingConfig: {
            thinkingBudget: thinkMode ? 5000 : 0,
          }
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
            console.log(`📝 AI Service: Chunk has ${candidate.content.parts.length} parts`);
            
            for (let i = 0; i < candidate.content.parts.length; i++) {
              const part = candidate.content.parts[i];
              
              if (part.text) {
                const chunkText = part.text;
                console.log(`🔤 AI Service: Part ${i} text length: ${chunkText.length}`);
                console.log(`🔤 AI Service: Part ${i} text: "${chunkText}"`);
                
                totalYielded += chunkText;
                console.log(`📊 AI Service: Total yielded so far: ${totalYielded.length} chars`);
                
                yield chunkText;
                console.log(`✅ AI Service: Yielded chunk part ${i} of chunk ${chunkCount}`);
              } else {
                console.log(`⚠️ AI Service: Part ${i} has no text`);
              }
            }
          } else {
            console.log('⚠️ AI Service: Chunk candidate has no content or parts');
          }
        } else {
          console.log('⚠️ AI Service: Chunk has no candidates');
        }
      }

      console.log(`🏁 AI Service: Finished streaming. Total chunks: ${chunkCount}, Total text: ${totalYielded.length} chars`);
      console.log(`📄 AI Service: Final complete text preview: "${totalYielded.substring(0, 200)}..."`);
      
    } catch (error) {
      console.error('❌ AI Service: Error in generateChatResponse:', error);
      yield `Sorry, I encountered an error: ${error.message}`;
    }
  }

  async generateSummary(fileContent: string): Promise<string> {
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
          systemInstruction: 'You are a summary generator. You will receive the extracted text from a file.Generate a concise summary of that text. Return ONLY the summary text, nothing else. The summary should be between around 3 and 4 sentences long.',
          temperature: 0.2,
        }
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
          systemInstruction: 'You are a session name generator. Generate a short, concise title (maximum 30 characters) for a chat conversation that starts with the message you receive. Return ONLY the title text, nothing else.',
          temperature: 0.2,
        }
      });
      const name = result.text;
      
      // Limit the length and remove any quotes
      return name?.substring(0, 30) ? name?.substring(0, 30) : `Chat ${new Date().toLocaleDateString()}`;
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
    `;

    return prompt;
  }

  async semanticSearch(query: string, userId: string, fileId?: string): Promise<SearchRecordsResponseResult['hits']> {
    const index = this.pc.index(this.configService.get('PINECONE_INDEX_NAME') as string, this.configService.get('PINECONE_INDEX_HOST') as string)
    const namespace = index.namespace(userId);
    const describedNamespace = await namespace.describeNamespace(userId);
    const recordCount = describedNamespace.recordCount;
    const recordCountNumber = Number(recordCount);
    const isRecordCountNumber = !isNaN(recordCountNumber);
    const topK = isRecordCountNumber ? (recordCountNumber < 10 ? recordCountNumber : 10) : 10;
    const topN = isRecordCountNumber ? (topK < 5 ? Math.floor(topK - (topK * 0.2)) : 5) : 5;
    const lessThan250Words = this.countWords(query) < 250;

    const response = await namespace.searchRecords({
      query: {
        topK: topK,
        inputs: { text: query },
      },
      fields: ['chunk_text', 'fileId', 'name'],
      ...(lessThan250Words ? {rerank: {
        model: 'bge-reranker-v2-m3',
        rankFields: ['chunk_text'],
        topN: topN,
      }} : {}),
    });

    return response.result.hits;
  }

  async generateFileName(content: string, fileName: string): Promise<string> {
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
          systemInstruction: 'You are a file title extractor. Extract the title from the following text that you receive, that was originally extracted from a file. Return ONLY the title text, nothing else.',
          temperature: 0.2,
        }
      });
      const name = result.text;
      
      // Limit the length and remove any quotes
      return name ? name : fileName;
    } catch (error) {
      console.error('Error generating file name:', error);
      return fileName;
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
          "Write a summary of the file named \"Sleep disorders and cancer incidence: examining duration and severity of diagnosis among veterans\""
          "Write a summary of the flashcard deck named \"Psychology I\""
          "Write a summary of the quiz named \"Politics II\""
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
          }
        }
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
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}
