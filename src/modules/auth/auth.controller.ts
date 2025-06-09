import { Controller, Post, Body, UseGuards, Request, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { User } from '../../entities/user.entity'; // Import User entity

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');
  
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  // Use Omit<User, 'password'> for req.user
  login(@Request() req: Request & { user: Omit<User, 'password'> }) {
    return this.authService.login(req.user);
  }

  @Post('register')
  async register(
    @Body()
    registerDto: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    },
    @Request() req: Request,
  ) {
    try {
      this.logger.log(`Register endpoint called with email: ${registerDto.email}`);
      
      // Log request headers to check for any auth headers being sent
      this.logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
      
      // Log request info to debug
      this.logger.debug(`Register request info: ${req.method} ${req.url}`);
      
      const result = await this.authService.register(registerDto);
      this.logger.log('Registration successful');
      return result;
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
