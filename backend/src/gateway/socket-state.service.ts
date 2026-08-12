import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

type PresenceState = 'active' | 'background';

/**
 * Shared singleton that holds the Socket.IO server instance and the
 * userId → socketId map so other services (admin, notifications…) can
 * emit events without creating circular module dependencies.
 */
@Injectable()
export class SocketStateService {
  private _server: Server | null = null;
  private _userSockets = new Map<string, Set<string>>(); // userId → socketIds
  private _socketPresence = new Map<string, { userId: string; state: PresenceState; lastHeartbeat: number }>();

  setServer(server: Server) { this._server = server; }
  get server(): Server | null { return this._server; }

  setUserSocket(userId: string, socketId: string, state: PresenceState = 'active') {
    const sockets = this._userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this._userSockets.set(userId, sockets);
    this.setSocketPresence(userId, socketId, state);
  }

  removeUserSocket(userId: string, socketId?: string) {
    if (!socketId) {
      this._userSockets.delete(userId);
      for (const [sid, presence] of this._socketPresence.entries()) {
        if (presence.userId === userId) this._socketPresence.delete(sid);
      }
      return;
    }
    const sockets = this._userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this._userSockets.delete(userId);
    this._socketPresence.delete(socketId);
  }

  hasUserSockets(userId: string): boolean {
    return (this._userSockets.get(userId)?.size ?? 0) > 0;
  }

  getSocketId(userId: string): string | undefined {
    return this.getSocketIds(userId)[0];
  }

  getSocketIds(userId: string): string[] {
    return [...(this._userSockets.get(userId) ?? [])];
  }

  getOnlineUserIds(): string[] { return [...this._userSockets.keys()]; }

  setSocketPresence(userId: string, socketId: string, state: PresenceState = 'active') {
    if (!this.getSocketIds(userId).includes(socketId)) return;
    this._socketPresence.set(socketId, { userId, state, lastHeartbeat: Date.now() });
  }

  hasActiveUserPresence(userId: string, maxAgeMs = 70_000): boolean {
    const now = Date.now();
    return this.getSocketIds(userId).some(socketId => {
      const presence = this._socketPresence.get(socketId);
      return Boolean(
        presence &&
        presence.userId === userId &&
        presence.state === 'active' &&
        now - presence.lastHeartbeat <= maxAgeMs,
      );
    });
  }

  getPresenceUserIds(): string[] {
    return [...new Set([...this._socketPresence.values()].map(item => item.userId))];
  }

  getUserPresenceSnapshot(userId: string) {
    return this.getSocketIds(userId).map(socketId => ({
      socketId,
      state: this._socketPresence.get(socketId)?.state ?? 'background',
      lastHeartbeat: this._socketPresence.get(socketId)?.lastHeartbeat ?? 0,
    }));
  }

  /** Emit to a specific user if connected */
  emitToUser(userId: string, event: string, data: any) {
    if (!this._server) return;
    for (const sid of this.getSocketIds(userId)) {
      this._server.to(sid).emit(event, data);
    }
  }

  /** Broadcast to ALL connected clients */
  emitToAll(event: string, data: any) {
    this._server?.emit(event, data);
  }
}
