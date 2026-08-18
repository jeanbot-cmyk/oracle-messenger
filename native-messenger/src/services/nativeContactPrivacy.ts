import {
  phoneCandidates,
  privacyDisplayNameForUser,
  type LocalPhoneContact,
} from '@/services/nativePhoneContacts';
import type { Conversation, Message, Participant, User } from '@/types/messenger';

type IdentityUser = User | Participant;
type ContactPrivacyIndex = {
  byEmail: Map<string, LocalPhoneContact>;
  byPhoneCandidate: Map<string, LocalPhoneContact>;
};

const indexCache = new WeakMap<LocalPhoneContact[], ContactPrivacyIndex>();

function contactPrivacyIndex(localContacts: LocalPhoneContact[]) {
  const cached = indexCache.get(localContacts);
  if (cached) return cached;

  const byEmail = new Map<string, LocalPhoneContact>();
  const byPhoneCandidate = new Map<string, LocalPhoneContact>();
  for (const contact of localContacts) {
    for (const email of contact.emails || []) {
      const key = email.trim().toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, contact);
    }
    for (const phone of contact.phones || []) {
      for (const candidate of phoneCandidates(phone)) {
        if (candidate && !byPhoneCandidate.has(candidate)) byPhoneCandidate.set(candidate, contact);
      }
    }
  }

  const next = { byEmail, byPhoneCandidate };
  indexCache.set(localContacts, next);
  return next;
}

function findIndexedLocalContactForUser(user: Pick<User, 'phone' | 'email'>, localContacts: LocalPhoneContact[]) {
  const index = contactPrivacyIndex(localContacts);
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (userEmail) {
    const byEmail = index.byEmail.get(userEmail);
    if (byEmail) return byEmail;
  }
  for (const candidate of phoneCandidates(user.phone || '')) {
    const byPhone = index.byPhoneCandidate.get(candidate);
    if (byPhone) return byPhone;
  }
  return null;
}

function applyPrivacyToUser<T extends IdentityUser>(
  user: T,
  currentUserId: string,
  localContacts: LocalPhoneContact[],
): T {
  if (!user?.id || user.id === currentUserId) return user;
  const localContact = findIndexedLocalContactForUser(user, localContacts);
  const displayName = privacyDisplayNameForUser(user, localContact);
  const displayAvatar = localContact?.avatar || (localContact ? user.avatar : null) || null;
  return {
    ...user,
    name: displayName,
    avatar: displayAvatar,
  };
}

export function applyContactPrivacyToMessage(
  message: Message,
  currentUserId: string,
  localContacts: LocalPhoneContact[],
): Message {
  const sender = message.sender ? applyPrivacyToUser(message.sender, currentUserId, localContacts) : message.sender;
  const replyTo = message.replyTo
    ? applyContactPrivacyToMessage(message.replyTo, currentUserId, localContacts)
    : message.replyTo;
  return sender === message.sender && replyTo === message.replyTo ? message : { ...message, sender, replyTo };
}

export function applyContactPrivacyToConversation(
  conversation: Conversation,
  currentUserId: string,
  localContacts: LocalPhoneContact[],
): Conversation {
  if (conversation.isOfficial || conversation.type === 'official') return conversation;

  const participants = conversation.participants.map(participant => (
    applyPrivacyToUser(participant, currentUserId, localContacts)
  ));
  const lastMessage = conversation.lastMessage
    ? applyContactPrivacyToMessage(conversation.lastMessage, currentUserId, localContacts)
    : conversation.lastMessage;

  if (conversation.type !== 'direct') {
    return { ...conversation, participants, lastMessage };
  }

  const peer = participants.find(participant => participant.id !== currentUserId) || participants[0];
  return {
    ...conversation,
    name: peer?.name || 'Contact Oracle',
    avatar: peer?.avatar || null,
    participants,
    lastMessage,
  };
}

export function applyContactPrivacyToConversations(
  conversations: Conversation[],
  currentUserId: string,
  localContacts: LocalPhoneContact[],
) {
  return conversations.map(conversation => applyContactPrivacyToConversation(conversation, currentUserId, localContacts));
}

export function applyContactPrivacyToMessages(
  messages: Message[],
  currentUserId: string,
  localContacts: LocalPhoneContact[],
) {
  return messages.map(message => applyContactPrivacyToMessage(message, currentUserId, localContacts));
}

export function applyContactPrivacyToParticipants(
  participants: Participant[],
  currentUserId: string,
  localContacts: LocalPhoneContact[],
) {
  return participants.map(participant => applyPrivacyToUser(participant, currentUserId, localContacts));
}
