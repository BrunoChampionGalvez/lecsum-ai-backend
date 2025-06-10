import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUserContext } from '../auth/jwt.strategy';
import { ChatService } from './chat.service';
import { ChatSession } from '../../entities/chat-session.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { NotFoundException } from '@nestjs/common';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  async findAllSessions(
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession[]> {
    return this.chatService.findAllSessionsByUser(req.user.id);
  }

  @Get('sessions/:id')
  async findSessionById(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession> {
    return this.chatService.findSessionById(id, req.user.id);
  }

  @Get('sessions/:id/messages')
  async findMessagesBySessionId(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatMessage[]> {
    // First check if the session exists and belongs to the user
    const session = await this.chatService.findSessionById(id, req.user.id);

    if (!session) {
      throw new NotFoundException(`Chat session with ID ${id} not found`);
    }

    // Return the messages for this session
    return session.messages || [];
  }

  @Post('sessions')
  async createSession(
    @Body() createDto: { fileIds?: string[] },
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession> {
    return this.chatService.createSession(req.user.id, createDto.fileIds);
  }

  @Patch('sessions/:id')
  async updateSession(
    @Param('id') id: string,
    @Body() updateDto: { name?: string },
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession> {
    return this.chatService.updateSession(id, req.user.id, updateDto);
  }

  @Post('sessions/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body()
    messageDto: {
      content: string;
      flashCardDeckIds?: string[];
      quizIds?: string[];
      previousSessionsIds?: string[];
      fileIds?: string[];
      folderIds?: string[];
      courseId?: string;
      thinkMode?: boolean;
    },
    @Request() req: { user: AuthenticatedUserContext },
    @Res() res: Response,
  ) {
    console.log('Message request received for session:', id);

    // Set appropriate headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering if applicable
    res.flushHeaders(); // Important to send headers immediately

    // Initial validation: verify the session exists before proceeding
    try {
      // Verify that the session exists and belongs to the user
      const session = await this.chatService.findSessionById(id, req.user.id);

      // Additional verification to ensure we have a valid session ID
      if (!session || !session.id) {
        const errorMsg = `Invalid session: ${!session ? 'not found' : 'missing ID'}`;
        console.error(errorMsg);
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
        return;
      }

      console.log(
        `Session validated successfully: ${session.id} (${session.name || 'unnamed'})`,
      );

      // Ensure the content is not empty
      if (!messageDto.content || messageDto.content.trim() === '') {
        res.write(
          `data: ${JSON.stringify({ error: 'Message content cannot be empty' })}\n\n`,
        );
        res.end();
        return;
      }

      console.log('Starting message processing with verified session ID:', id);

      try {
        // Get the message generator from service
        const generator = this.chatService.sendMessage(
          id,
          req.user.id,
          messageDto.content,
          messageDto.flashCardDeckIds || [],
          messageDto.quizIds || [],
          messageDto.previousSessionsIds || [],
          messageDto.fileIds || [],
          messageDto.folderIds || [],
          messageDto.courseId || '',
          messageDto.thinkMode || false,
        );

        // Stream each chunk as it's generated
        for await (const chunk of generator) {
          // Log occasionally to monitor progress
          if (Math.random() < 0.05) {
            // Log ~5% of chunks to avoid excessive logging
            console.log(
              `Streaming chunk for session ${id}:`,
              chunk.substring(0, 20) + (chunk.length > 20 ? '...' : ''),
            );
          }

          // Proper SSE format for Server-Sent Events
          res.write(`data: ${chunk}\n\n`);
        }

        console.log('Message stream completed for session:', id);
      } catch (streamError: unknown) {
        // Handle errors during streaming
        console.error(
          `Error streaming response for session ${id}:`,
          streamError,
        );
        let errorMessageString = 'Unknown streaming error';
        if (streamError instanceof Error) {
          errorMessageString = streamError.message;
        } else if (typeof streamError === 'string') {
          errorMessageString = streamError;
        }

        // If it's a database constraint error, provide more helpful information
        if (
          errorMessageString.includes('violates not-null constraint') &&
          errorMessageString.includes('chatSessionId')
        ) {
          console.error(
            'Database constraint violation: chatSessionId cannot be null',
          );
          res.write(
            `data: ${JSON.stringify({
              error:
                'Database error: Unable to associate message with chat session',
            })}\n\n`,
          );
        } else {
          res.write(
            `data: ${JSON.stringify({
              error: `Error generating response: ${errorMessageString}`,
            })}\n\n`,
          );
        }
      }
    } catch (error: unknown) {
      // Handle any other errors
      console.error('Error in message endpoint:', error);
      let errorMessageString = 'Unknown error';
      if (error instanceof Error) {
        errorMessageString = error.message;
      } else if (typeof error === 'string') {
        errorMessageString = error;
      }

      try {
        res.write(`data: ${JSON.stringify({ error: errorMessageString })}\n\n`);
      } catch (responseError) {
        console.error('Failed to send error response:', responseError);
      }
    } finally {
      // Always ensure the response is ended
      try {
        res.end();
        console.log('Response ended for session:', id);
      } catch (endError) {
        console.error('Error ending response:', endError);
      }
    }
  }

  @Patch('sessions/:id/name')
  async updateSessionName(
    @Param('id') id: string,
    @Body() updateDto: { name: string },
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession> {
    return this.chatService.updateSession(id, req.user.id, {
      name: updateDto.name,
    });
  }

  @Patch('sessions/:id/context')
  async updateSessionContext(
    @Param('id') id: string,
    @Body() updateDto: { fileIds: string[] },
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<ChatSession> {
    return this.chatService.updateSessionContext(
      id,
      req.user.id,
      updateDto.fileIds,
    );
  }

  @Delete('sessions/:id')
  async deleteSession(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<void> {
    return this.chatService.deleteSession(id, req.user.id);
  }

  @Get('reference-path/:type/:id')
  async getReferencePath(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUserContext },
  ): Promise<{ path: string }> {
    try {
      console.log(
        `Getting reference path for ${type}:${id} for user ${req.user.id}`,
      );
      const path = await this.chatService.getReferencePathById(
        { type, id },
        req.user.id,
      );
      console.log(`Successfully found path for ${type}:${id}: ${path}`);
      return { path };
    } catch (e: unknown) {
      let statusCode: number | undefined;
      let message: string = 'Not found'; // Default message for 404 case

      if (typeof e === 'object' && e !== null) {
        const error = e as {
          response?: { statusCode?: number; message?: string };
          status?: number;
          message?: string;
        };
        statusCode = error.response?.statusCode ?? error.status;
        if (statusCode === 404) {
          message = error.response?.message ?? error.message ?? 'Not found';
        } else {
          message = error.message ?? 'Unknown error getting reference path';
        }
      } else if (typeof e === 'string') {
        message = e;
      }

      // Check if it's a common NotFoundException (for missing references)
      if (statusCode === 404) {
        // Log a simplified message without the full stack trace
        console.log(`Reference not found: ${type}/${id} - ${message}`);
        return { path: `[Deleted ${type}]` };
      } else {
        // For other errors, log with full details but don't assume the file is deleted
        console.error(`Error getting reference path for ${type}/${id}:`, e);

        // For other types of errors, return a different message indicating it might be an access issue
        return { path: `[Error accessing ${type}]` };
      }
    }
  }
}
