import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { User } from '../../entities/user.entity.js'; // Import User entity

@Controller('auth')
export class AuthController {
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
  ) {
    return this.authService.register(registerDto);
  }
}
