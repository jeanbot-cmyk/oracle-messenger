export type User = {
  id: string;
  email?: string;
  name: string;
  username?: string;
  avatar?: string | null;
  bio?: string | null;
  phone?: string | null;
  status?: string;
  isNew?: boolean;
};

export type Participant = User;

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'document' | string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  sender?: User;
  isDeleted?: boolean;
  isEdited?: boolean;
  replyToId?: string | null;
  replyTo?: Message | null;
  reactions?: { emoji: string; userId: string; updatedAt?: string }[];
};

export type Conversation = {
  id: string;
  type: 'direct' | 'group' | 'official' | string;
  name?: string | null;
  avatar?: string | null;
  participants: Participant[];
  lastMessage?: Message | null;
  unreadCount?: number;
  updatedAt?: string;
};

export type AuthSession = {
  token: string;
  user: User;
};
