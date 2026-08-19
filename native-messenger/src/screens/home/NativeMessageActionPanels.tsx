import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Forward, Pencil, Reply, Share2, Trash2, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { Conversation, Message } from '@/types/messenger';
import { conversationName } from './homeUtils';

type NativeMessageActionPanelsProps = {
  selectedCount: number;
  selectedMessages: Message[];
  forwardMessages: Message[];
  actionMessage: Message | null;
  quickReactions: readonly string[];
  conversations: Conversation[];
  activeConversationId: string;
  currentUserId: string;
  onShare: (messages: Message[]) => void | Promise<void>;
  onBeginForward: (messages: Message[]) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onClearForward: () => void;
  onCloseMessageActions: () => void;
  onReactMessage: (message: Message, emoji: string | null) => void | Promise<void>;
  onReplyMessage: (message: Message) => void;
  onCopyMessage: (message: Message) => void | Promise<void>;
  onEditMessage: (message: Message) => void;
  onDeleteMessageForMe: (message: Message) => void;
  onDeleteMessageForAll: (message: Message) => void;
  onToggleSelection: (messageId: string) => void;
  onForwardToConversation: (conversation: Conversation | Conversation[]) => void | Promise<void>;
};

const MAX_FORWARD_TARGETS = 25;

export function NativeMessageActionPanels({
  selectedCount,
  selectedMessages,
  forwardMessages,
  actionMessage,
  quickReactions,
  conversations,
  activeConversationId,
  currentUserId,
  onShare,
  onBeginForward,
  onDeleteSelected,
  onClearSelection,
  onClearForward,
  onCloseMessageActions,
  onReactMessage,
  onReplyMessage,
  onCopyMessage,
  onEditMessage,
  onDeleteMessageForMe,
  onDeleteMessageForAll,
  onToggleSelection,
  onForwardToConversation,
}: NativeMessageActionPanelsProps) {
  const [selectedForwardTargetIds, setSelectedForwardTargetIds] = useState<string[]>([]);
  const actionMessageIsMine = actionMessage?.senderId === currentUserId;
  const actionMessageIsSystem = actionMessage?.type === 'system';
  const canReactActionMessage = Boolean(actionMessage && !actionMessage.isDeleted && !actionMessageIsSystem);
  const canReplyActionMessage = Boolean(actionMessage && !actionMessage.isDeleted && !actionMessageIsSystem);
  const canEditActionMessage = Boolean(actionMessage && actionMessageIsMine && actionMessage.type === 'text' && !actionMessage.isDeleted);
  const canDeleteActionMessage = Boolean(actionMessage && !actionMessage.isDeleted);
  const currentReaction = actionMessage?.reactions?.find(reaction => reaction.userId === currentUserId)?.emoji;
  const forwardTargets = useMemo(
    () => conversations.filter(item => item.id !== activeConversationId).slice(0, 80),
    [activeConversationId, conversations],
  );
  const selectedForwardTargets = useMemo(() => {
    const selectedIds = new Set(selectedForwardTargetIds);
    return forwardTargets.filter(conversation => selectedIds.has(conversation.id));
  }, [forwardTargets, selectedForwardTargetIds]);

  useEffect(() => {
    if (!forwardMessages.length) setSelectedForwardTargetIds([]);
  }, [forwardMessages.length]);

  const selectActionMessage = () => {
    if (!actionMessage) return;
    onToggleSelection(actionMessage.id);
    onCloseMessageActions();
  };

  const toggleForwardTarget = (conversationId: string) => {
    setSelectedForwardTargetIds(current => {
      if (current.includes(conversationId)) return current.filter(id => id !== conversationId);
      if (current.length >= MAX_FORWARD_TARGETS) return current;
      return [...current, conversationId];
    });
  };

  return (
    <>
      {actionMessage ? (
        <Pressable style={styles.messageActionOverlay} onPress={onCloseMessageActions}>
          <Pressable style={styles.messageActionPanel} onPress={() => undefined}>
            <View style={styles.messageActionHeader}>
              <Text numberOfLines={1} style={styles.messageActionTitle}>Actions du message</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconClose} onPress={onCloseMessageActions}>
                <X size={19} color={colors.header} strokeWidth={2.8} />
              </Pressable>
            </View>
            {canReactActionMessage ? (
              <View style={styles.reactionRow}>
                {quickReactions.map(emoji => {
                  const selected = currentReaction === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityLabel={`Réagir ${emoji}`}
                      style={[styles.reactionButton, selected ? styles.reactionButtonSelected : null]}
                      onPress={event => {
                        event.stopPropagation();
                        void onReactMessage(actionMessage, selected ? null : emoji);
                      }}
                    >
                      <Text style={styles.reactionText}>{emoji}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.messageActionGrid}>
              {canReplyActionMessage ? <ActionButton icon={<Reply size={17} color={colors.header} strokeWidth={2.6} />} label="Répondre" onPress={() => onReplyMessage(actionMessage)} /> : null}
              <ActionButton icon={<Copy size={17} color={colors.header} strokeWidth={2.6} />} label="Copier" onPress={() => onCopyMessage(actionMessage)} />
              <ActionButton icon={<Forward size={17} color={colors.header} strokeWidth={2.6} />} label="Transférer" onPress={() => onBeginForward([actionMessage])} />
              <ActionButton icon={<Share2 size={17} color={colors.header} strokeWidth={2.6} />} label="Partager" onPress={() => onShare([actionMessage])} />
              <ActionButton label="Sélectionner" onPress={selectActionMessage} />
              {canEditActionMessage ? <ActionButton icon={<Pencil size={17} color={colors.header} strokeWidth={2.6} />} label="Modifier" onPress={() => onEditMessage(actionMessage)} /> : null}
              {canDeleteActionMessage ? <ActionButton icon={<Trash2 size={17} color={colors.danger} strokeWidth={2.6} />} label="Pour moi" danger onPress={() => onDeleteMessageForMe(actionMessage)} /> : null}
              {canDeleteActionMessage && actionMessageIsMine ? <ActionButton icon={<Trash2 size={17} color={colors.danger} strokeWidth={2.6} />} label="Pour tous" danger onPress={() => onDeleteMessageForAll(actionMessage)} /> : null}
            </View>
          </Pressable>
        </Pressable>
      ) : null}
      {selectedCount ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedCount} sélectionné(s)</Text>
          <Pressable style={styles.selectionButton} onPress={() => onShare(selectedMessages)}>
            <Text style={styles.selectionButtonText}>Partager</Text>
          </Pressable>
          <Pressable style={styles.selectionButton} onPress={() => onBeginForward(selectedMessages)}>
            <Text style={styles.selectionButtonText}>Transférer</Text>
          </Pressable>
          <Pressable style={styles.selectionDanger} onPress={onDeleteSelected}>
            <Text style={styles.selectionDangerText}>Supprimer</Text>
          </Pressable>
          <Pressable style={styles.selectionClose} onPress={onClearSelection}>
            <Text style={styles.selectionCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      {forwardMessages.length ? (
        <View style={styles.forwardPanel}>
          <View style={styles.forwardHead}>
            <Text style={styles.forwardTitle}>Transférer {forwardMessages.length} message(s) vers {selectedForwardTargetIds.length}/25 contact(s)</Text>
            <Pressable onPress={onClearForward} style={styles.selectionClose}>
              <Text style={styles.selectionCloseText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.forwardHint}>Sélectionnez un ou plusieurs destinataires, puis confirmez l’envoi.</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.forwardTargetScroll} contentContainerStyle={styles.forwardTargets}>
            {forwardTargets.map(conversation => {
              const selected = selectedForwardTargetIds.includes(conversation.id);
              return (
              <Pressable key={conversation.id} style={[styles.forwardTarget, selected && styles.forwardTargetSelected]} onPress={() => toggleForwardTarget(conversation.id)}>
                <Text numberOfLines={1} style={styles.forwardTargetText}>{conversationName(conversation)}</Text>
                <View style={[styles.forwardTargetCheck, selected && styles.forwardTargetCheckSelected]}>
                  {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
              </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            disabled={!selectedForwardTargets.length}
            onPress={() => onForwardToConversation(selectedForwardTargets)}
            style={[styles.forwardSendButton, !selectedForwardTargets.length && styles.forwardSendButtonDisabled]}
          >
            <Forward size={17} color="#FFFFFF" strokeWidth={2.7} />
            <Text style={styles.forwardSendText}>Envoyer à {selectedForwardTargets.length || 0}</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function ActionButton({
  icon,
  label,
  danger,
  onPress,
}: {
  icon?: ReactNode;
  label: string;
  danger?: boolean;
  onPress: () => void | Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.actionButton, danger ? styles.actionButtonDanger : null]}
      onPress={event => {
        event.stopPropagation();
        void onPress();
      }}
    >
      {icon}
      <Text numberOfLines={1} style={[styles.actionButtonText, danger ? styles.actionButtonDangerText : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  messageActionOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 40, elevation: 40, justifyContent: 'flex-end', backgroundColor: 'rgba(6,20,20,0.20)', paddingHorizontal: 12, paddingBottom: 104 },
  messageActionPanel: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(16,42,42,0.14)', padding: 12, gap: 11, shadowColor: '#0B1F1F', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  messageActionHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  messageActionTitle: { flex: 1, color: colors.header, fontSize: 14, fontWeight: '900' },
  iconClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(16,42,42,0.08)', alignItems: 'center', justifyContent: 'center' },
  reactionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  reactionButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#F4F7F6', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  reactionButtonSelected: { backgroundColor: '#EAF7EF', borderColor: colors.accent },
  reactionText: { fontSize: 22, lineHeight: 27 },
  messageActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { minHeight: 38, maxWidth: '48%', flexGrow: 1, flexBasis: '31%', borderRadius: 13, backgroundColor: '#F6F8F7', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionButtonDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionButtonText: { color: colors.header, fontSize: 11.5, fontWeight: '900' },
  actionButtonDangerText: { color: colors.danger },
  selectionBar: { marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 16, backgroundColor: '#F7F8F8', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  selectionText: { color: colors.header, fontSize: 12.5, fontWeight: '900', marginRight: 4 },
  selectionButton: { minHeight: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  selectionButtonText: { color: colors.header, fontSize: 11.5, fontWeight: '900' },
  selectionDanger: { minHeight: 32, borderRadius: 12, backgroundColor: '#FEE2E2', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  selectionDangerText: { color: colors.danger, fontSize: 11.5, fontWeight: '900' },
  selectionClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.10)', alignItems: 'center', justifyContent: 'center' },
  selectionCloseText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  forwardPanel: { marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 },
  forwardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  forwardTitle: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '900' },
  forwardHint: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  forwardTargetScroll: { maxHeight: 260 },
  forwardTargets: { gap: 8, paddingRight: 4 },
  forwardTarget: { minHeight: 44, width: '100%', borderRadius: 14, backgroundColor: '#EEF2F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.08)', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  forwardTargetSelected: { backgroundColor: '#EAF7EF', borderColor: colors.accent },
  forwardTargetText: { flex: 1, minWidth: 0, color: colors.header, fontSize: 12, fontWeight: '900' },
  forwardTargetCheck: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16,42,42,0.18)', alignItems: 'center', justifyContent: 'center' },
  forwardTargetCheckSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  forwardSendButton: { minHeight: 44, borderRadius: 14, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  forwardSendButtonDisabled: { opacity: 0.45 },
  forwardSendText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
});
