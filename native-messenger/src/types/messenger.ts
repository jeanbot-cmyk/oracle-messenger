export type User = {
  id: string;
  email?: string;
  name: string;
  username?: string;
  avatar?: string | null;
  bio?: string | null;
  phone?: string | null;
  status?: string;
  lastSeen?: string | null;
  activeUntil?: string | null;
  isNew?: boolean;
  role?: 'admin' | 'member' | string;
  joinedAt?: string | null;
  canSendMessages?: boolean;
};

export type Participant = User;

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type Message = {
  id: string;
  clientMessageId?: string | null;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'document' | 'system' | string;
  status?: MessageStatus | string;
  createdAt: string;
  updatedAt?: string;
  sender?: User;
  isDeleted?: boolean;
  isEdited?: boolean;
  replyToId?: string | null;
  replyTo?: Message | null;
  reactions?: { emoji: string; userId: string; updatedAt?: string }[];
};

export type GroupInvitation = {
  id: string;
  conversationId: string;
  invitedUserId: string;
  invitedById: string;
  status: 'INVITED' | 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED' | 'LEFT' | string;
  respondedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  group?: {
    id: string;
    name?: string | null;
    avatar?: string | null;
    description?: string | null;
  };
  invitedUser?: User;
  invitedBy?: User;
};

export type Conversation = {
  id: string;
  type: 'direct' | 'group' | 'official' | string;
  name?: string | null;
  avatar?: string | null;
  description?: string | null;
  messagePolicy?: 'ALL_PARTICIPANTS' | 'ADMINS_ONLY' | string;
  participants: Participant[];
  participantCount?: number;
  currentUserRole?: 'admin' | 'member' | string;
  currentUserCanSendMessages?: boolean;
  pendingInvitations?: GroupInvitation[];
  lastMessage?: Message | null;
  unreadCount?: number;
  updatedAt?: string;
  isPinned?: boolean;
  isOfficial?: boolean;
  isVerified?: boolean;
  officialOpenedAt?: string | null;
  officialExpiresAt?: string | null;
  officialState?: {
    received: boolean;
    unread: boolean;
    opened_at?: string | null;
    expires_at?: string | null;
    openedAt?: string | null;
    expiresAt?: string | null;
  };
};

export type AuthSession = {
  token: string;
  user: User;
};
