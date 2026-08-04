import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogCallDto {
  callId: string;
  userId: string;
  peerId: string;
  peerName: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed' | 'refused' | 'cancelled';
  duration?: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  getIceServers() {
    const turnUrls = (process.env.TURN_URLS ?? '')
      .split(',')
      .map(url => url.trim())
      .filter(Boolean);

    const iceServers: IceServerConfig[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];

    if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    } else {
      iceServers.push({
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      });
    }

    return { iceServers };
  }

  async logCall(dto: LogCallDto) {
    const allowedTypes = new Set(['audio', 'video']);
    const allowedDirections = new Set(['incoming', 'outgoing', 'missed', 'refused', 'cancelled']);
    if (!dto.callId || !dto.peerId || !allowedTypes.has(dto.type) || !allowedDirections.has(dto.direction)) {
      throw new BadRequestException('Journal d’appel invalide');
    }
    if (dto.peerId === dto.userId) {
      throw new BadRequestException('Correspondant invalide');
    }
    const peer = await this.prisma.user.findUnique({ where: { id: dto.peerId }, select: { id: true } });
    if (!peer) throw new BadRequestException('Correspondant introuvable');

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
