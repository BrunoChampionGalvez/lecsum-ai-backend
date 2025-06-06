import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { geminiConfig } from '../../config/gemini.config';
import { ChatMessage } from '../../entities/chat-message.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ChatMessage]),
  ],
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
