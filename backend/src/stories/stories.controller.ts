import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('stories')
@UseGuards(JwtGuard)
export class StoriesController {
  constructor(private stories: StoriesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.stories.findAll(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() body: { content: string; caption?: string; type: string; bg: string }) {
    return this.stories.create(req.user.id, body);
  }

  @Post(':id/view')
  view(@Param('id') id: string, @Req() req: any) {
    return this.stories.markViewed(id, req.user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.stories.delete(id, req.user.id);
  }
}
