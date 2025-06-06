import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { QuizzesService } from './quizzes.service.js';
import { Quiz } from '../../entities/quiz.entity.js';
import { DifficultyLevel } from '../../entities/flashcard.entity.js';
import { QuizQuestion } from '../../entities/quiz-question.entity.js';

interface UserPayload {
  id: string;
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

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizzesController {
  @Post()
  async createQuiz(
    @Body()
    createDto: {
      title: string;
      courseId: string;
      questions: {
        question: string;
        correctAnswer: string;
        options: string[];
      }[];
    },
    @Request() req: { user: UserPayload },
  ): Promise<Quiz> {
    return this.quizzesService.createQuiz(req.user.id, createDto);
  }
  // ...existing endpoints...

  @Put(':id')
  async updateQuiz(
    @Param('id') id: string,
    @Body()
    updateDto: {
      title: string;
      questions: {
        question: string;
        correctAnswer: string;
        options: string[];
      }[];
    },
    @Request() req: { user: UserPayload },
  ): Promise<Quiz> {
    return this.quizzesService.updateQuiz(id, req.user.id, updateDto);
  }
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get()
  async findAll(@Request() req: { user: UserPayload }): Promise<Quiz[]> {
    return this.quizzesService.findAll(req.user.id);
  }

  @Get('course/:courseId')
  async findAllByCourse(
    @Param('courseId') courseId: string,
    @Request() req: { user: UserPayload },
  ): Promise<Quiz[]> {
    return this.quizzesService.findAllByCourse(courseId, req.user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<Quiz> {
    return this.quizzesService.findOne(id, req.user.id);
  }

  @Post('generate')
  async generateQuiz(
    @Body()
    generateDto: {
      courseId: string;
      fileIds: string[];
      folderIds: string[];
      questionCount: number;
      difficulty: DifficultyLevel;
      title: string;
    },
    @Request() req: { user: UserPayload },
  ): Promise<QuizQuestion[]> {
    return this.quizzesService.generateQuiz(generateDto.courseId, req.user.id, {
      fileIds: generateDto.fileIds,
      folderIds: generateDto.folderIds,
      difficulty: generateDto.difficulty,
      questionCount: generateDto.questionCount,
      title: generateDto.title,
    });
  }

  @Post(':id/submit')
  async submitQuizAnswers(
    @Param('id') id: string,
    @Body() submitDto: { answers: { questionId: string; answer: string }[] },
    @Request() req: { user: UserPayload },
  ): Promise<Quiz> {
    return this.quizzesService.submitQuizAnswers(
      id,
      req.user.id,
      submitDto.answers,
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<void> {
    return this.quizzesService.deleteQuiz(id, req.user.id);
  }

  @Get(':id/details')
  async findQuizDetails(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<QuizDetails> {
    return this.quizzesService.findQuizDetails(id, req.user.id);
  }

  @Get('question/:id')
  async findQuestionDetails(
    @Param('id') id: string,
    @Request() req: { user: UserPayload },
  ): Promise<QuestionDetails> {
    return this.quizzesService.findQuestionDetails(id, req.user.id);
  }

  @Post('questions/batch')
  async findQuestionsDetailsBatch(
    @Body() body: { ids: string[] },
  ): Promise<Record<string, QuestionDetails>> {
    // No auth guard check for this endpoint to match the behavior of findQuestionDetails
    return this.quizzesService.findQuestionsDetailsBatch(body.ids);
  }
}
