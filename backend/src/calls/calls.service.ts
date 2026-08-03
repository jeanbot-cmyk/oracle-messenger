import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogCallDto {
  callId: string;
  userId: string;
  peerId: string;
  peerName: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  duration?: number;
}

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async logCall(dto: LogCallDto) {
    const existing = await this.prisma.callLog.findFirst({
      where: { callId: dto.callId, userId: dto.userId },
      orderBy: { startedAt: 'desc' },
    });
    const data = {
      peerId:    dto.peerId,
      peerName:  dto.peerName,
      type:      dto.type,
      direction: dto.direction,
      duration:  dto.duration ?? null,
    };
    if (existing) {
      return this.prisma.callLog.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.callLog.create({
      data: {
        callId: dto.callId,
        userId: dto.userId,
        ...data,
      },
    });
  }

  async getHistory(userId: string, limit = 50) {
    return this.prisma.callLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, callId: true, peerId: true, peerName: true,
        type: true, direction: true, duration: true, startedAt: true,
      },
    });
  }

  async deleteEntry(id: string, userId: string) {
    return this.prisma.callLog.deleteMany({ where: { id, userId } });
  }

  async clearHistory(userId: string) {
    return this.prisma.callLog.deleteMany({ where: { userId } });
  }
}
