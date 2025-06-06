import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (!user) {
      return null;
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email };
    const response = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken: this.jwtService.sign(payload),
    };
    
    console.log('Auth service login response:', JSON.stringify(response));
    return response;
  }

  async register(userData: { email: string; password: string; firstName?: string; lastName?: string }) {
    // Check if user already exists
    const existingUser = await this.usersService.findOne(userData.email);
    if (existingUser) {
      throw new UnauthorizedException('User with this email already exists');
    }

    // Create new user
    const newUser = await this.usersService.create(userData);
    
    // Return user data and token
    const { password, ...userWithoutPassword } = newUser;
    return this.login(userWithoutPassword);
  }
}
