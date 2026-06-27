import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, premiumUsers, totalMessages, totalConversations] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.message.count({ where: { isDeleted: false } }),
      this.prisma.conversation.count(),
    ]);

    const onlineUsers = await this.prisma.user.count({ where: { status: 'online' } });

    return { totalUsers, premiumUsers, totalMessages, totalConversations, onlineUsers };
  }

  getMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;

    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + ((total - cpu.times.idle) / total) * 100;
    }, 0) / cpus.length;

    return {
      cpu:    Math.round(cpuUsage),
      ramUsed: Math.round(usedMem / 1024 / 1024),
      ramTotal: Math.round(totalMem / 1024 / 1024),
      ramPct:  Math.round((usedMem / totalMem) * 100),
      uptime:  Math.round(os.uptime()),
      platform: os.platform(),
    };
  }

  async getRecentUsers(limit = 20) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, email: true, isPremium: true, status: true, createdAt: true },
    });
  }
}
