export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  username: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
  isPremium: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: User;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  replyTo?: Message;
  reactions?: { emoji: string; userId: string }[];
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  userName: string;
}

// NextAuth session extension
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username: string;
      backendToken: string;
    };
  }
}
declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    username?: string;
    backendToken?: string;
    googleId?: string;
  }
}
