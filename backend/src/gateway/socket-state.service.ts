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
  private _userSockets = new Map<string, string>(); // userId → socketId

  setServer(server: Server) { this._server = server; }
  get server(): Server | null { return this._server; }

  setUserSocket(userId: string, socketId: string) { this._userSockets.set(userId, socketId); }
  removeUserSocket(userId: string) { this._userSockets.delete(userId); }
  getSocketId(userId: string): string | undefined { return this._userSockets.get(userId); }
  getOnlineUserIds(): string[] { return [...this._userSockets.keys()]; }

  /** Emit to a specific user if connected */
  emitToUser(userId: string, event: string, data: any) {
    const sid = this._userSockets.get(userId);
    if (sid && this._server) this._server.to(sid).emit(event, data);
  }

  /** Broadcast to ALL connected clients */
  emitToAll(event: string, data: any) {
    this._server?.emit(event, data);
  }
}
