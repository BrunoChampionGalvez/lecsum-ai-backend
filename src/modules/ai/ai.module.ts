import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service.js';
import { geminiConfig } from '../../config/gemini.config.js';
import { ChatMessage } from '../../entities/chat-message.entity.js';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ChatMessage])],
  providers: [
    {
      provide: 'GEMINI_CONFIG',
      useValue: geminiConfig,
    },
    {
      provide: 'CONFIG_SERVICE',
      useExisting: ConfigService,
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
