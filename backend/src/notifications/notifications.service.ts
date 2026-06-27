import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:admin@oracle-plus.online',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
    }
  }

  async savePushSubscription(userId: string, subscription: any) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: JSON.stringify(subscription) },
    });
  }

  async sendPush(userId: string, payload: { title: string; body: string; url?: string; image?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken) return;
    try {
      const subscription = JSON.parse(user.pushToken);
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch {}
  }

  async sendToAll(payload: { title: string; body: string }) {
    const users = await this.prisma.user.findMany({ where: { pushToken: { not: null } } });
    await Promise.allSettled(users.map(u => this.sendPush(u.id, payload)));
  }
}
