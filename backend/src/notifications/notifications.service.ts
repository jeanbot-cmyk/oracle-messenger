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
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    const existing = this.parseSubscriptions(existingUser?.pushToken);
    const next = this.upsertSubscription(existing, subscription);

    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: JSON.stringify(next) },
    });
  }

  async sendPush(userId: string, payload: { title: string; body: string; url?: string; image?: string; tag?: string; type?: string; requireInteraction?: boolean; vibrate?: number[] }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken) return;
    const subscriptions = this.parseSubscriptions(user.pushToken);
    if (!subscriptions.length) return;

    const results = await Promise.allSettled(
      subscriptions.map(subscription => webpush.sendNotification(subscription, JSON.stringify(payload))),
    );

    const stillValid = subscriptions.filter((_, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') return true;
      const statusCode = (result.reason as any)?.statusCode;
      return statusCode !== 404 && statusCode !== 410;
    });

    if (stillValid.length !== subscriptions.length) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { pushToken: stillValid.length ? JSON.stringify(stillValid) : null },
      }).catch(() => null);
    }
  }

  async sendToAll(payload: { title: string; body: string }) {
    const users = await this.prisma.user.findMany({ where: { pushToken: { not: null } } });
    await Promise.allSettled(users.map(u => this.sendPush(u.id, payload)));
  }

  private parseSubscriptions(raw?: string | null): any[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  }

  private upsertSubscription(existing: any[], subscription: any) {
    const endpoint = subscription?.endpoint;
    if (!endpoint) return existing;
    const withoutDuplicate = existing.filter(item => item?.endpoint !== endpoint);
    return [...withoutDuplicate, subscription].slice(-5);
  }
}
