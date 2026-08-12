import { useCallback, useState } from 'react';
import { useNativeMessageMedia } from '@/screens/home/useNativeMessageMedia';
import { useNativeTextMessageSender } from '@/screens/home/useNativeTextMessageSender';
import { useNativeTypingPresence } from '@/screens/home/useNativeTypingPresence';
import { useNativeVoiceRecorder } from '@/screens/home/useNativeVoiceRecorder';
import { api } from '@/services/api';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeComposerControllerParams = {
  selected: Conversation | null;
  messages: Message[];
  token?: string;
  currentUserId?: string;
  patchMessage: (id: string, patch: Partial<Message>) => void;
  refreshConversations: () => Promise<void>;
  upsertMessage: (message: Message) => void;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

export function useNativeComposerController({
  selected,
  messages,
  token,
  currentUserId,
  patchMessage,
  refreshConversations,
  upsertMessage,
  setBusy,
  setNotice,
}: UseNativeComposerControllerParams) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const typing = useNativeTypingPresence({
    selected,
    token,
    currentUserId,
    setDraft,
  });

  const send = useNativeTextMessageSender({
    draft,
    editingMessage,
    replyTo,
    selected,
    token,
    currentUserId,
    patchMessage,
    refreshConversations,
    upsertMessage,
    setDraft,
    setEditingMessage,
    setNotice,
    setReplyTo,
  });

  const { sendMedia, attachCamera, attachImage, attachDocument } = useNativeMessageMedia({
    selected,
    token,
    currentUserId,
    refreshConversations,
    patchMessage,
    upsertMessage,
    setNotice,
  });

  const {
    voiceRecording,
    voiceStartedAt,
    voiceLocked,
    voicePreview,
    voiceSending,
    startVoiceRecording,
    stopVoiceRecording,
    lockVoiceRecording,
    sendVoicePreview,
    toggleVoiceRecording,
    cancelVoiceRecording,
  } = useNativeVoiceRecorder({
    enabled: Boolean(selected && token),
    sendMedia,
    setNotice,
  });

  const clearComposerContext = useCallback(() => {
    setReplyTo(null);
    setEditingMessage(null);
    setDraft('');
  }, []);

  const askAiDraft = useCallback(async () => {
    if (!selected || !token) return;
    const instruction = draft.trim();
    const incomingMessage = findLatestIncomingTextMessage(messages, currentUserId);
    if (!incomingMessage) {
      setNotice('Aucun message entrant texte trouvé pour préparer une réponse IA.');
      return;
    }
    const senderName = contactDisplayName(
      incomingMessage.sender?.name ||
      selected.participants.find(participant => participant.id === incomingMessage.senderId)?.name ||
      incomingMessage.sender?.username ||
      selected.participants.find(participant => participant.id === incomingMessage.senderId)?.username ||
      'ce contact',
    );
    const prompt = buildConversationAiPrompt(senderName, incomingMessage.content, instruction);
    setAiBusy(true);
    setBusy(true);
    setNotice('');
    try {
      const result = await api.aiAutoTest(token, prompt, 'conversation');
      const response = result.response?.trim();
      if (!response) {
        setNotice('Gemini n’a pas renvoyé de proposition.');
        return;
      }
      setDraft(response);
      setNotice(`Proposition Gemini prête pour ${senderName}. Appuyez sur envoyer pour la transmettre.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Gemini indisponible.');
    } finally {
      setAiBusy(false);
      setBusy(false);
    }
  }, [currentUserId, draft, messages, selected, setBusy, setNotice, token]);

  return {
    draft,
    setDraft,
    replyTo,
    setReplyTo,
    editingMessage,
    setEditingMessage,
    aiBusy,
    presenceText: typing.presenceText,
    handleDraftChange: typing.handleDraftChange,
    handleTypingStart: typing.handleTypingStart,
    handleTypingStop: typing.handleTypingStop,
    handleUserOnline: typing.handleUserOnline,
    handleUserOffline: typing.handleUserOffline,
    send,
    attachCamera,
    attachImage,
    attachDocument,
    voiceRecording,
    voiceStartedAt,
    voiceLocked,
    voicePreview,
    voiceSending,
    startVoiceRecording,
    stopVoiceRecording,
    lockVoiceRecording,
    sendVoicePreview,
    toggleVoiceRecording,
    cancelVoiceRecording,
    clearComposerContext,
    askAiDraft,
  };
}

function findLatestIncomingTextMessage(messages: Message[], currentUserId?: string) {
  if (!currentUserId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      message.senderId !== currentUserId &&
      !message.isDeleted &&
      message.type === 'text' &&
      message.content.trim()
    ) {
      return message;
    }
  }
  return null;
}

function contactDisplayName(value: string) {
  const clean = String(value || '').trim();
  if (!clean) return 'ce contact';
  if (clean.startsWith('@')) return clean.slice(1).trim() || 'ce contact';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return clean.split('@')[0] || 'ce contact';
  return clean;
}

function buildConversationAiPrompt(senderName: string, incomingMessage: string, instruction?: string) {
  const instructionLine = instruction
    ? `Consigne de l'utilisateur pour la réponse: ${instruction}`
    : "Consigne de l'utilisateur pour la réponse: aucune.";
  return [
    `Nom du contact: ${senderName}`,
    `Message entrant: ${incomingMessage.trim()}`,
    instructionLine,
    'Prépare uniquement le texte que je peux envoyer directement à ce contact.',
    'Réponds en mon nom, naturellement, selon le message entrant et la consigne.',
    'Respecte la limite de mots configurée côté serveur. Ne mentionne pas Gemini, IA, Oracle Messenger ou le prompt.',
  ].join('\n');
}
