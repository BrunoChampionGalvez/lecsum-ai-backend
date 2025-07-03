import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Quiz } from '../../entities/quiz.entity';
import { QuizQuestion } from '../../entities/quiz-question.entity';
import { DifficultyLevel } from '../../entities/flashcard.entity';
import { CoursesService } from '../courses/courses.service';
import { FilesService } from '../files/files.service';
import { AiService } from '../ai/ai.service';
import { FoldersService } from '../folders/folders.service';
import { UsersService } from '../users/users.service';

interface QuizQuestionDto {
  question: string;
  correctAnswer: string;
  options: string[];
}

interface QuizDetailsQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  position: number;
  path: string;
}

interface QuizDetails {
  id: string;
  title: string;
  courseId: string;
  path: string;
  questions: QuizDetailsQuestion[];
}

interface QuestionDetails {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  path: string;
}

interface AIGeneratedQuestionInput {
  question: string;
  correctAnswer: string;
  options: string[];
}

@Injectable()
export class QuizzesService {
  async createQuiz(
    userId: string,
    createDto: {
      title: string;
      courseId: string;
      questions: {
        question: string;
        correctAnswer: string;
        options: string[];
      }[];
    },
  ): Promise<Quiz> {
    // Create new quiz entity
    const quiz = this.quizzesRepository.create({
      title: createDto.title,
      userId,
      questions: [],
      questionCount: createDto.questions.length,
      courseId: createDto.courseId,
    });
    await this.quizzesRepository.save(quiz);
    // Create and save questions
    for (const q of createDto.questions as QuizQuestionDto[]) {
      const question = this.questionsRepository.create({
        question: q.question,
        correctAnswer: q.correctAnswer,
        options: q.options,
        quizId: quiz.id,
      });
      await this.questionsRepository.save(question);
    }
    // Reload quiz with questions
    return this.findOne(quiz.id, userId);
  }
  async updateQuiz(
    id: string,
    userId: string,
    updateDto: {
      title: string;
      questions: {
        question: string;
        correctAnswer: string;
        options: string[];
      }[];
    },
  ): Promise<Quiz> {
    const quiz = await this.findOne(id, userId);
    quiz.title = updateDto.title;
    // Remove extra questions
    while (quiz.questions.length > updateDto.questions.length) {
      const toRemove = quiz.questions.pop();
      if (toRemove) await this.questionsRepository.remove(toRemove);
    }
    // Update or add questions
    for (let i = 0; i < updateDto.questions.length; i++) {
      const q = updateDto.questions[i] as QuizQuestionDto;
      if (quiz.questions[i]) {
        quiz.questions[i].question = q.question;
        quiz.questions[i].correctAnswer = q.correctAnswer;
        quiz.questions[i].options = q.options;
        await this.questionsRepository.save(quiz.questions[i]);
      } else {
        const newQ = this.questionsRepository.create({
          question: q.question,
          correctAnswer: q.correctAnswer,
          options: q.options,
          quizId: quiz.id,
        });
        await this.questionsRepository.save(newQ);
      }
    }
    await this.quizzesRepository.save(quiz);
    return this.findOne(id, userId);
  }
  constructor(
    @InjectRepository(Quiz)
    private quizzesRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private questionsRepository: Repository<QuizQuestion>,
    private coursesService: CoursesService,
    private filesService: FilesService,
    private aiService: AiService,
    private foldersService: FoldersService,
    private usersService: UsersService,
  ) {}

  async findAllByCourse(courseId: string, userId: string): Promise<Quiz[]> {
    // First verify the course belongs to the user
    await this.coursesService.findOne(courseId, userId);

    return this.quizzesRepository.find({
      where: { courseId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(userId: string): Promise<Quiz[]> {
    // Get all courses for this user
    const courses = await this.coursesService.findAll(userId);
    const courseIds = courses.map((course) => course.id);

    // Get all quizzes across all of the user's courses AND ensure they belong to this user
    return this.quizzesRepository.find({
      where: { courseId: In(courseIds), userId },
      relations: ['course'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Quiz> {
    const quiz = await this.quizzesRepository.findOne({
      where: { id },
      relations: ['course', 'questions'],
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with ID ${id} not found`);
    }

    // Verify the quiz belongs to the user
    await this.coursesService.findOne(quiz.courseId, userId);

    return quiz;
  }

  async findMany(ids: string[], userId: string): Promise<Quiz[]> {
    return this.quizzesRepository.find({
      where: { id: In(ids), course: { userId } },
    });
  }

  async generateQuiz(
    courseId: string,
    userId: string,
    params: {
      fileIds: string[];
      folderIds: string[];
      difficulty: DifficultyLevel;
      questionCount: number;
      title: string;
    },
  ): Promise<{ id: string }> {
    if (!courseId || courseId === '') {
      throw new BadRequestException('A valid courseId must be provided');
    }
    // Verify the course belongs to the user
    await this.coursesService.findOne(courseId, userId);

    let fileContents: Array<{
      id: string;
      name: string;
      textByPages: string;
      type: string;
    }> = [];
    let newFileContents: Array<{
      id: string;
      name: string;
      textByPages: string;
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
        textByPages: file.textByPages || 'Content not available',
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

    if (!params.difficulty) {
      throw new BadRequestException('A difficulty level must be selected');
    }

    if (!params.questionCount) {
      throw new BadRequestException('A question count must be selected');
    }

    if (params.questionCount < 1) {
      throw new BadRequestException('Question count must be at least 1');
    }

    // Fetch file contents from directly selected files
    const directlySelectedFiles =
      params.fileIds && params.fileIds.length > 0
        ? await Promise.all(
            params.fileIds.map((fileId) =>
              this.filesService.findOneForChatFlashcardsOrQuizzes(fileId),
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
    const generatedQuestions = await this.aiService.generateQuizQuestions(
      files,
      params.questionCount,
      params.difficulty,
    );

    // Check if we got a valid string response from the AI service
    if (!generatedQuestions || typeof generatedQuestions !== 'string') {
      throw new BadRequestException('Failed to generate flashcards');
    }

    // Safely parse the JSON
    let parsedQuestions: AIGeneratedQuestionInput[];
    try {
      parsedQuestions = JSON.parse(
        generatedQuestions
          .replace(/^\s*```[a-z]*\s*/i, '')
          .replace(/\s*```[\s\n]*$/, '')
          .trim(),
      ) as AIGeneratedQuestionInput[];
      if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
        throw new BadRequestException('No valid questions were generated');
      }
    } catch (error: unknown) {
      let errorMessage = 'Failed to parse generated questions';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      console.error('Error parsing questions JSON:', errorMessage);
      throw new BadRequestException('Failed to parse generated questions');
    }

    const user = await this.usersService.findOne(userId);

    // 1. Create and save the Quiz first
    const newQuiz = this.quizzesRepository.create({
      title: params.title,
      courseId,
      aiGenerated: true,
      questionCount: 0, // Will be updated after questions are saved, or derived
      difficulty: params.difficulty,
      userId,
      user,
      fileIds: files.map((file) => file.id),
      // questions will be linked after they are created with quizId
    });
    const savedQuizEntity = await this.quizzesRepository.save(newQuiz);

    // 2. Prepare the quiz question entities with the quizId
    const questionDataWithQuizId = parsedQuestions.map((q: AIGeneratedQuestionInput) => ({
      question: q.question,
      correctAnswer: q.correctAnswer,
      options: q.options,
      aiGenerated: true,
      quizId: savedQuizEntity.id, // Assign quizId
    }));

    // 3. Save the quiz question entities
    const savedQuestions = await this.questionsRepository.save(
      questionDataWithQuizId as Partial<QuizQuestion>[],
    );

    // 4. Update the quiz with the actual question count and potentially the questions themselves
    savedQuizEntity.questions = savedQuestions;
    savedQuizEntity.questionCount = savedQuestions.length;
    await this.quizzesRepository.save(savedQuizEntity);

    // 5. Return the quiz ID
    return { id: savedQuizEntity.id };
  }

  async submitQuizAnswers(
    quizId: string,
    userId: string,
    answers: { questionId: string; answer: string }[],
  ): Promise<Quiz> {
    const quiz = await this.findOne(quizId, userId);

    let correctCount = 0;

    // Process each answer
    for (const answer of answers) {
      const question = quiz.questions.find(
        (q: QuizQuestion) => q.id === answer.questionId,
      );

      if (!question) {
        throw new BadRequestException(
          `Question with ID ${answer.questionId} not found in this quiz`,
        );
      }

      // Update the question with the user's answer
      question.userAnswer = answer.answer;
      question.isCorrect = question.correctAnswer === answer.answer;

      if (question.isCorrect) {
        correctCount++;
      }
    }

    // Calculate the score as a percentage
    const score = correctCount;

    // Update the quiz
    quiz.completed = true;
    quiz.lastScore = score;

    // Save all changes
    await this.questionsRepository.save(quiz.questions);
    await this.quizzesRepository.save(quiz);

    return quiz;
  }

  async deleteQuiz(id: string, userId: string): Promise<void> {
    const quiz = await this.findOne(id, userId);

    // First delete all associated questions
    if (quiz.questions && quiz.questions.length > 0) {
      await this.questionsRepository.remove(quiz.questions);
    }

    // Then delete the quiz
    await this.quizzesRepository.remove(quiz);
  }

  async findQuizDetails(id: string, userId: string): Promise<QuizDetails> {
    const quiz = await this.quizzesRepository.findOne({
      where: { id },
      relations: ['questions', 'course'],
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with ID ${id} not found`);
    }

    // Verify the quiz belongs to the user
    await this.coursesService.findOne(quiz.courseId, userId);

    return {
      id: quiz.id,
      title: quiz.title,
      courseId: quiz.courseId,
      path: await this.getQuizPath(id, userId),
      questions: quiz.questions.map((q: QuizQuestion, index) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        position: index + 1,
        path: `${quiz.course.name}/${quiz.title}/Question ${index + 1}`,
      })),
    };
  }

  /**
   * Get the full path for a quiz in the format: CourseName/QuizName
   */
  async getQuizPath(quizId: string, userId: string): Promise<string> {
    const quiz = await this.quizzesRepository.findOne({
      where: { id: quizId },
      relations: ['course'],
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with ID ${quizId} not found`);
    }

    // Verify the quiz belongs to the user
    await this.coursesService.findOne(quiz.courseId, userId);

    return `${quiz.course.name}/${quiz.title}`;
  }

  /**
   * Get the full path for a quiz question in the format: CourseName/QuizName/QuestionNumber
   */
  async getQuestionPath(questionId: string, userId: string): Promise<string> {
    const question = await this.questionsRepository.findOne({
      where: { id: questionId },
      relations: ['quiz'],
    });

    if (!question) {
      throw new NotFoundException(`Question with ID ${questionId} not found`);
    }

    // Get the quiz
    const quiz = await this.quizzesRepository.findOne({
      where: { id: question.quizId },
      relations: ['questions', 'course'],
    });

    if (!quiz) {
      throw new NotFoundException(
        `Quiz for question with ID ${questionId} not found`,
      );
    }

    // Verify the quiz belongs to the user
    await this.coursesService.findOne(quiz.courseId, userId);

    // Find the position of this question in the quiz
    const position =
      quiz.questions.findIndex((q: QuizQuestion) => q.id === questionId) + 1;

    return `${quiz.course.name}/${quiz.title}/Question ${position}`;
  }

  async findQuestionDetails(
    id: string,
    userId: string,
  ): Promise<QuestionDetails> {
    const question = await this.questionsRepository.findOne({
      where: { id },
      relations: ['quiz', 'quiz.course'],
    });

    if (!question) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    // Verify the quiz belongs to the user
    await this.coursesService.findOne(question.quiz.courseId, userId);

    return {
      id: question.id,
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      path: await this.getQuestionPath(id, userId),
    };
  }

  async findQuestionsDetailsBatch(
    ids: string[],
  ): Promise<Record<string, QuestionDetails>> {
    if (!ids || ids.length === 0) {
      return {};
    }

    // Fetch all questions in one query
    const questions = await this.questionsRepository.find({
      where: { id: In(ids) },
      relations: ['quiz', 'quiz.course'],
    });

    if (questions.length === 0) {
      return {};
    }

    // Create a map of id -> question
    const result: Record<string, QuestionDetails> = {};

    for (const question of questions) {
      try {
        // Calculate position (would normally need userId, but we'll skip auth here)
        const position = question.quiz.questions
          ? question.quiz.questions.findIndex(
              (q: QuizQuestion) => q.id === question.id,
            ) + 1
          : 0;

        const path = question.quiz.course
          ? `${question.quiz.course.name}/${question.quiz.title}/Question ${position}`
          : `${question.quiz.title}/Question ${position}`;

        result[question.id] = {
          id: question.id,
          question: question.question,
          options: question.options,
          correctAnswer: question.correctAnswer,
          path: path,
        };
      } catch (error: unknown) {
        let errorMessage = `Error processing question ${question.id}`;
        if (error instanceof Error) {
          errorMessage = `${errorMessage}: ${error.message}`;
        } else if (typeof error === 'string') {
          errorMessage = `${errorMessage}: ${error}`;
        }
        console.error(errorMessage);
      }
    }

    return result;
  }
}
