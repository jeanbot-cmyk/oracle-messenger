import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { Conversation, Message } from '@/types/messenger';
import { conversationName } from './homeUtils';

type NativeMessageActionPanelsProps = {
  selectedCount: number;
  selectedMessages: Message[];
  forwardMessages: Message[];
  conversations: Conversation[];
  activeConversationId: string;
  onShare: (messages: Message[]) => void | Promise<void>;
  onBeginForward: (messages: Message[]) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onClearForward: () => void;
  onForwardToConversation: (conversation: Conversation) => void | Promise<void>;
};

export function NativeMessageActionPanels({
  selectedCount,
  selectedMessages,
  forwardMessages,
  conversations,
  activeConversationId,
  onShare,
  onBeginForward,
  onDeleteSelected,
  onClearSelection,
  onClearForward,
  onForwardToConversation,
}: NativeMessageActionPanelsProps) {
  return (
    <>
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
            <Text style={styles.forwardTitle}>Transférer {forwardMessages.length} message(s)</Text>
            <Pressable onPress={onClearForward} style={styles.selectionClose}>
              <Text style={styles.selectionCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forwardTargets}>
            {conversations.filter(item => item.id !== activeConversationId).slice(0, 20).map(conversation => (
              <Pressable key={conversation.id} style={styles.forwardTarget} onPress={() => onForwardToConversation(conversation)}>
                <Text numberOfLines={1} style={styles.forwardTargetText}>{conversationName(conversation)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  forwardTargets: { gap: 8, paddingRight: 4 },
  forwardTarget: { minHeight: 36, maxWidth: 150, borderRadius: 18, backgroundColor: '#EEF2F1', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  forwardTargetText: { color: colors.header, fontSize: 12, fontWeight: '900' },
});
