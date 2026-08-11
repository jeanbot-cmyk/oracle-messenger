import { useCallback, useState } from 'react';
import { useNativeMessageMedia } from '@/screens/home/useNativeMessageMedia';
import { useNativeTextMessageSender } from '@/screens/home/useNativeTextMessageSender';
import { useNativeTypingPresence } from '@/screens/home/useNativeTypingPresence';
import { useNativeVoiceRecorder } from '@/screens/home/useNativeVoiceRecorder';
import { api } from '@/services/api';
import type { Conversation, Message } from '@/types/messenger';

type UseNativeComposerControllerParams = {
  selected: Conversation | null;
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
    patchMessage,
    refreshConversations,
    upsertMessage,
    setDraft,
    setEditingMessage,
    setNotice,
    setReplyTo,
  });

  const { sendMedia, attachImage, attachDocument } = useNativeMessageMedia({
    selected,
    token,
    refreshConversations,
    upsertMessage,
    setBusy,
    setNotice,
  });

  const { voiceRecording, voiceStartedAt, toggleVoiceRecording, cancelVoiceRecording } = useNativeVoiceRecorder({
    enabled: Boolean(selected && token),
    sendMedia,
    setBusy,
    setNotice,
  });

  const clearComposerContext = useCallback(() => {
    setReplyTo(null);
    setEditingMessage(null);
    setDraft('');
  }, []);

  const askAiDraft = useCallback(async () => {
    if (!selected || !token) return;
    const prompt = draft.trim();
    if (!prompt) {
      setNotice('Écrivez un brouillon ou une instruction avant Gemini.');
      return;
    }
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
      setNotice('Proposition Gemini prête dans la zone de message.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Gemini indisponible.');
    } finally {
      setAiBusy(false);
      setBusy(false);
    }
  }, [draft, selected, setBusy, setNotice, token]);

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
    attachImage,
    attachDocument,
    voiceRecording,
    voiceStartedAt,
    toggleVoiceRecording,
    cancelVoiceRecording,
    clearComposerContext,
    askAiDraft,
  };
}
