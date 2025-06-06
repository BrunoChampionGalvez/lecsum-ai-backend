import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { databaseConfig } from './config/database.config.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { FlashcardsModule } from './modules/flashcards/flashcards.module.js';
import { QuizzesModule } from './modules/quizzes/quizzes.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { FoldersModule } from './modules/folders/folders.module.js';
import { DecksModule } from './modules/decks/decks.module.js';
import { SubscriptionModule } from './subscription/subscription.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    UsersModule,
    AuthModule,
    CoursesModule,
    FilesModule,
    FoldersModule,
    FlashcardsModule,
    QuizzesModule,
    ChatModule,
    AiModule,
    DecksModule,
    SubscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
