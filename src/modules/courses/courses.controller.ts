import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Course } from '../../entities/course.entity';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAll(@Request() req): Promise<Course[]> {
    return this.coursesService.findAll(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req): Promise<Course> {
    return this.coursesService.findOne(id, req.user.id);
  }

  @Post()
  async create(
    @Body() createCourseDto: { name: string; description?: string },
    @Request() req,
  ): Promise<Course> {
    // Check if user has reached the maximum number of courses (5)
    const courseCount = await this.coursesService.countUserCourses(req.user.id);
    if (courseCount >= 5) {
      throw new Error('Maximum number of courses (5) reached');
    }
    
    return this.coursesService.create(createCourseDto, req.user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCourseDto: { name?: string; description?: string },
    @Request() req,
  ): Promise<Course> {
    return this.coursesService.update(id, updateCourseDto, req.user.id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req): Promise<void> {
    return this.coursesService.delete(id, req.user.id);
  }
}
