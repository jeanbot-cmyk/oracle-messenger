import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Shared singleton that holds the Socket.IO server instance and the
 * userId → socketId map so other services (admin, notifications…) can
 * emit events without creating circular module dependencies.
 */
@Injectable()
export class SocketStateService {
  private _server: Server | null = null;
  private _userSockets = new Map<string, Set<string>>(); // userId → socketIds

  setServer(server: Server) { this._server = server; }
  get server(): Server | null { return this._server; }

  setUserSocket(userId: string, socketId: string) {
    const sockets = this._userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this._userSockets.set(userId, sockets);
  }

  removeUserSocket(userId: string, socketId?: string) {
    if (!socketId) {
      this._userSockets.delete(userId);
      return;
    }
    const sockets = this._userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this._userSockets.delete(userId);
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
