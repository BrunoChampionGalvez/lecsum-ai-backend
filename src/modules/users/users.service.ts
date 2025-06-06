import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOne(email: string): Promise<User | undefined> {
    const user = await this.usersRepository.findOne({ where: { email } });
    return user || undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const user = await this.usersRepository.findOne({ where: { id } });
    return user || undefined;
  }

  async create(userData: { email: string; password: string; firstName?: string; lastName?: string }): Promise<User> {
    const { password, ...rest } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = this.usersRepository.create({
      ...rest,
      password: hashedPassword,
    });
    
    return this.usersRepository.save(user);
  }

  async update(id: string, userData: { firstName?: string; lastName?: string }): Promise<User | undefined> {
    await this.usersRepository.update(id, userData);
    return this.findById(id);
  }
}
