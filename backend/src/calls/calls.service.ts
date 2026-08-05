import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessToken } from 'livekit-server-sdk';

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

export interface SfuTokenDto {
  room: string;
  identity: string;
  name?: string;
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
      // Secours public en priorité: si le TURN du VPS est filtré par
      // l'hébergeur ou par un réseau mobile, les appels ne doivent pas rester
      // bloqués après la sonnerie.
      {
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ];

    if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }

    return { iceServers };
  }

  async createSfuToken(dto: SfuTokenDto) {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!url || !apiKey || !apiSecret) {
      return {
        enabled: false,
        reason: 'LIVEKIT_URL, LIVEKIT_API_KEY ou LIVEKIT_API_SECRET manquant',
      };
    }

    if (!dto.room || !dto.identity) {
      throw new BadRequestException('Salle SFU invalide');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: dto.identity,
      name: dto.name ?? dto.identity,
    });
    token.addGrant({
      room: dto.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      enabled: true,
      provider: 'livekit',
      url,
      room: dto.room,
      token: await token.toJwt(),
    };
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
    const entries = await this.prisma.callLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, callId: true, peerId: true, peerName: true,
        type: true, direction: true, duration: true, startedAt: true,
      },
    });
    const peerIds = [...new Set(entries.map(entry => entry.peerId).filter(Boolean))];
    const peers = peerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: peerIds } },
          select: { id: true, avatar: true, name: true },
        })
      : [];
    const peersById = new Map(peers.map(peer => [peer.id, peer]));
    return entries.map(entry => {
      const peer = peersById.get(entry.peerId);
      return {
        ...entry,
        peerName: peer?.name || entry.peerName,
        peerAvatar: peer?.avatar ?? null,
      };
    });
  }

  async deleteEntry(id: string, userId: string) {
    return this.prisma.callLog.deleteMany({ where: { id, userId } });
  }

  async clearHistory(userId: string) {
    return this.prisma.callLog.deleteMany({ where: { userId } });
  }
}
