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
    return this.prisma.callLog.create({
      data: {
        callId:    dto.callId,
        userId:    dto.userId,
        peerId:    dto.peerId,
        peerName:  dto.peerName,
        type:      dto.type,
        direction: dto.direction,
        duration:  dto.duration ?? null,
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
