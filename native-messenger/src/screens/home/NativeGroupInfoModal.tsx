import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Shield, ShieldOff, UserMinus, UserPlus, Users, X } from 'lucide-react-native';
import { api } from '@/services/api';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import type { Conversation, GroupInvitation, User } from '@/types/messenger';
import { conversationName, highQualityImageUri, initials } from './homeUtils';

type NativeGroupInfoModalProps = {
  visible: boolean;
  token: string;
  currentUserId: string;
  conversation: Conversation;
  conversations: Conversation[];
  onClose: () => void;
  onGroupChanged: (conversation: Conversation) => void | Promise<void>;
  onGroupLeft: () => void | Promise<void>;
};

function activeInvitation(invitation: GroupInvitation) {
  const status = String(invitation.status || '').toUpperCase();
  return status === 'PENDING' || status === 'INVITED';
}

export function NativeGroupInfoModal({
  visible,
  token,
  currentUserId,
  conversation,
  conversations,
  onClose,
  onGroupChanged,
  onGroupLeft,
}: NativeGroupInfoModalProps) {
  const [info, setInfo] = useState<Conversation>(conversation);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [inviteMode, setInviteMode] = useState(false);
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set());
  const [editName, setEditName] = useState(conversationName(conversation));
  const [editDescription, setEditDescription] = useState(conversation.description || '');

  const group = info || conversation;
  const isAdmin = group.currentUserRole === 'admin';
  const adminOnly = group.messagePolicy === 'ADMINS_ONLY';
  const avatar = highQualityImageUri(group.avatar);

  const reloadGroup = useCallback(() => {
    if (!visible) return;
    api.conversation(conversation.id, token)
      .then(fresh => {
        setInfo(fresh);
        setEditName(conversationName(fresh));
        setEditDescription(fresh.description || '');
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Chargement du groupe impossible.'));
  }, [conversation.id, token, visible]);

  useEffect(() => {
    if (!visible) return;
    setInfo(conversation);
    setEditName(conversationName(conversation));
    setEditDescription(conversation.description || '');
    setNotice('');
    setInviteMode(false);
    setSelectedInvitees(new Set());
    reloadGroup();
  }, [conversation, reloadGroup, visible]);

  const selectableContacts = useMemo(() => {
    const blocked = new Set<string>([currentUserId]);
    group.participants.forEach(participant => blocked.add(participant.id));
    (group.pendingInvitations || []).forEach(invitation => {
      if (activeInvitation(invitation)) blocked.add(invitation.invitedUserId);
    });
    const byId = new Map<string, User>();
    conversations.forEach(item => {
      if (item.type === 'official' || item.isOfficial) return;
      item.participants.forEach(participant => {
        if (!participant?.id || blocked.has(participant.id)) return;
        byId.set(participant.id, participant);
      });
    });
    return [...byId.values()].sort((left, right) => String(left.name || left.username || '').localeCompare(String(right.name || right.username || '')));
  }, [conversations, currentUserId, group.participants, group.pendingInvitations]);

  const applyConversation = useCallback(async (next: Conversation) => {
    setInfo(next);
    setEditName(conversationName(next));
    setEditDescription(next.description || '');
    await onGroupChanged(next);
  }, [onGroupChanged]);

  const runGroupAction = useCallback(async (action: () => Promise<Conversation>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const next = await action();
      await applyConversation(next);
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Action groupe impossible.');
    } finally {
      setBusy(false);
    }
  }, [applyConversation, busy]);

  const toggleInvitee = useCallback((userId: string) => {
    selectionHaptic();
    setSelectedInvitees(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const inviteSelected = useCallback(() => {
    const ids = [...selectedInvitees];
    if (!ids.length) {
      setNotice('Sélectionnez au moins un contact à inviter.');
      return;
    }
    void runGroupAction(
      () => api.addGroupMembers(token, group.id, ids),
      'Invitation envoyée. La personne ne sera membre qu’après acceptation.',
    ).then(() => {
      setInviteMode(false);
      setSelectedInvitees(new Set());
    });
  }, [group.id, runGroupAction, selectedInvitees, token]);

  const saveGroupBasics = useCallback(() => {
    if (!editName.trim()) {
      setNotice('Donnez un nom au groupe.');
      return;
    }
    void runGroupAction(
      () => api.updateGroup(token, group.id, { name: editName.trim(), description: editDescription.trim() || null }),
      'Informations du groupe mises à jour.',
    );
  }, [editDescription, editName, group.id, runGroupAction, token]);

  const togglePolicy = useCallback(() => {
    const nextPolicy = adminOnly ? 'ALL_PARTICIPANTS' : 'ADMINS_ONLY';
    void runGroupAction(
      () => api.updateGroup(token, group.id, { messagePolicy: nextPolicy }),
      nextPolicy === 'ADMINS_ONLY' ? 'Mode administrateurs uniquement activé.' : 'Tous les participants peuvent publier.',
    );
  }, [adminOnly, group.id, runGroupAction, token]);

  const setRole = useCallback((participant: User, role: 'admin' | 'member') => {
    if (role === 'member') {
      Alert.alert(
        'Retirer les droits admin',
        `Retirer les droits administrateur de ${participant.name || participant.username || 'ce membre'} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Retirer', style: 'destructive', onPress: () => void runGroupAction(() => api.setGroupMemberRole(token, group.id, participant.id, role), 'Rôle mis à jour.') },
        ],
      );
      return;
    }
    void runGroupAction(() => api.setGroupMemberRole(token, group.id, participant.id, role), 'Rôle mis à jour.');
  }, [group.id, runGroupAction, token]);

  const toggleWritePermission = useCallback((participant: User) => {
    const next = participant.canSendMessages === false;
    void runGroupAction(
      () => api.setGroupMemberPermission(token, group.id, participant.id, next),
      next ? 'Le membre peut de nouveau publier.' : 'Le membre est en lecture seule.',
    );
  }, [group.id, runGroupAction, token]);

  const removeParticipant = useCallback((participant: User) => {
    Alert.alert(
      'Retirer du groupe',
      `Retirer ${participant.name || participant.username || 'ce membre'} du groupe ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => void runGroupAction(() => api.removeGroupMember(token, group.id, participant.id), 'Membre retiré du groupe.') },
      ],
    );
  }, [group.id, runGroupAction, token]);

  const cancelInvitation = useCallback((invitation: GroupInvitation) => {
    Alert.alert(
      'Annuler l’invitation',
      `Annuler l’invitation envoyée à ${invitation.invitedUser?.name || invitation.invitedUser?.username || 'ce contact'} ?`,
      [
        { text: 'Garder', style: 'cancel' },
        { text: 'Annuler', style: 'destructive', onPress: () => void runGroupAction(() => api.cancelGroupInvitation(token, group.id, invitation.id), 'Invitation annulée.') },
      ],
    );
  }, [group.id, runGroupAction, token]);

  const leaveGroup = useCallback(() => {
    Alert.alert(
      'Quitter le groupe',
      `Quitter "${conversationName(group)}" ? Vous ne recevrez plus les nouveaux messages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            api.leaveGroup(token, group.id)
              .then(async () => {
                await onGroupLeft();
                onClose();
              })
              .catch(error => setNotice(error instanceof Error ? error.message : 'Impossible de quitter le groupe.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [group, onClose, onGroupLeft, token]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={event => event.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Informations du groupe</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.header} strokeWidth={2.8} />
            </Pressable>
          </View>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <View style={styles.profile}>
              <View style={styles.avatar}>
                {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} resizeMode="cover" /> : <Users size={34} color="#FFFFFF" strokeWidth={2.4} />}
              </View>
              <View style={styles.profileText}>
                <TextInput value={editName} onChangeText={setEditName} editable={isAdmin && !busy} style={styles.nameInput} />
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  editable={isAdmin && !busy}
                  placeholder="Description du groupe"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={styles.descriptionInput}
                />
              </View>
            </View>
            <View style={styles.statLine}>
              <Text style={styles.statText}>{group.participantCount || group.participants.length} participant(s)</Text>
              <Text style={styles.statText}>{adminOnly ? 'Administrateurs uniquement' : 'Tous peuvent publier'}</Text>
            </View>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {isAdmin ? (
              <View style={styles.adminActions}>
                <Pressable onPress={saveGroupBasics} disabled={busy} style={styles.actionButton}>
                  <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
                  <Text style={styles.actionButtonText}>Enregistrer</Text>
                </Pressable>
                <Pressable onPress={togglePolicy} disabled={busy} style={styles.secondaryButton}>
                  <Shield size={16} color={colors.header} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>{adminOnly ? 'Ouvrir l’écriture' : 'Admins uniquement'}</Text>
                </Pressable>
                <Pressable onPress={() => { lightImpactHaptic(); setInviteMode(current => !current); }} disabled={busy} style={styles.secondaryButton}>
                  <UserPlus size={16} color={colors.header} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>Inviter</Text>
                </Pressable>
              </View>
            ) : null}
            {inviteMode ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contacts à inviter</Text>
                {!selectableContacts.length ? <Text style={styles.empty}>Aucun contact disponible à inviter.</Text> : null}
                {selectableContacts.map(contact => {
                  const selected = selectedInvitees.has(contact.id);
                  const contactAvatar = highQualityImageUri(contact.avatar);
                  return (
                    <Pressable key={contact.id} onPress={() => toggleInvitee(contact.id)} style={[styles.row, selected && styles.rowSelected]}>
                      <View style={styles.smallAvatar}>
                        {contactAvatar ? <Image source={{ uri: contactAvatar }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.smallAvatarText}>{initials(contact.name || contact.username)}</Text>}
                      </View>
                      <View style={styles.rowText}>
                        <Text numberOfLines={1} style={styles.rowTitle}>{contact.name || contact.username || 'Contact'}</Text>
                        <Text numberOfLines={1} style={styles.rowSub}>{contact.phone || contact.email || 'Oracle Messenger'}</Text>
                      </View>
                      <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                        {selected ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={inviteSelected} disabled={busy || !selectedInvitees.size} style={[styles.actionButton, (!selectedInvitees.size || busy) && styles.disabled]}>
                  {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.actionButtonText}>Envoyer l’invitation</Text>}
                </Pressable>
              </View>
            ) : null}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Participants</Text>
              {group.participants.map(participant => {
                const participantAvatar = highQualityImageUri(participant.avatar);
                const admin = participant.role === 'admin';
                const self = participant.id === currentUserId;
                return (
                  <View key={participant.id} style={styles.row}>
                    <View style={styles.smallAvatar}>
                      {participantAvatar ? <Image source={{ uri: participantAvatar }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.smallAvatarText}>{initials(participant.name || participant.username)}</Text>}
                    </View>
                    <View style={styles.rowText}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{participant.name || participant.username || 'Membre'}</Text>
                      <Text numberOfLines={1} style={[styles.rowSub, admin && styles.adminText]}>
                        {admin ? 'Administrateur' : 'Membre'}{participant.canSendMessages === false ? ' · Lecture seule' : ''}{participant.phone ? ` · ${participant.phone}` : ''}
                      </Text>
                    </View>
                    {isAdmin && !self ? (
                      <View style={styles.iconActions}>
                        <Pressable onPress={() => setRole(participant, admin ? 'member' : 'admin')} disabled={busy} style={styles.iconButton}>
                          {admin ? <ShieldOff size={15} color={colors.header} strokeWidth={2.5} /> : <Shield size={15} color={colors.header} strokeWidth={2.5} />}
                        </Pressable>
                        <Pressable onPress={() => toggleWritePermission(participant)} disabled={busy} style={styles.iconButton}>
                          <Text style={styles.iconText}>{participant.canSendMessages === false ? 'ON' : 'OFF'}</Text>
                        </Pressable>
                        <Pressable onPress={() => removeParticipant(participant)} disabled={busy} style={styles.dangerIconButton}>
                          <UserMinus size={15} color={colors.danger} strokeWidth={2.6} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {group.pendingInvitations?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invitations</Text>
                {group.pendingInvitations.map(invitation => {
                  const contact = invitation.invitedUser;
                  const contactAvatar = highQualityImageUri(contact?.avatar);
                  const pending = activeInvitation(invitation);
                  return (
                    <View key={invitation.id} style={styles.row}>
                      <View style={styles.smallAvatar}>
                        {contactAvatar ? <Image source={{ uri: contactAvatar }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.smallAvatarText}>{initials(contact?.name || contact?.username)}</Text>}
                      </View>
                      <View style={styles.rowText}>
                        <Text numberOfLines={1} style={styles.rowTitle}>{contact?.name || contact?.username || 'Contact invité'}</Text>
                        <Text numberOfLines={1} style={styles.rowSub}>{pending ? 'En attente' : invitation.status}</Text>
                      </View>
                      {isAdmin && pending ? (
                        <Pressable onPress={() => cancelInvitation(invitation)} disabled={busy} style={styles.dangerIconButton}>
                          <X size={15} color={colors.danger} strokeWidth={2.6} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={leaveGroup} disabled={busy} style={styles.leaveButton}>
              <Text style={styles.leaveButtonText}>Quitter le groupe</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.48)', justifyContent: 'flex-end' },
  card: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.title, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  content: { maxHeight: '82%' },
  contentInner: { gap: 12, paddingBottom: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 72, height: 72, borderRadius: 18, backgroundColor: colors.header, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  profileText: { flex: 1, minWidth: 0, gap: 8 },
  nameInput: { minHeight: 44, borderRadius: 14, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  descriptionInput: { minHeight: 58, maxHeight: 96, borderRadius: 14, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingTop: 9, color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlignVertical: 'top' },
  statLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statText: { overflow: 'hidden', borderRadius: 999, backgroundColor: colors.accentSoft, color: colors.header, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  notice: { color: colors.danger, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { minHeight: 42, borderRadius: 16, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  actionButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  secondaryButton: { minHeight: 42, borderRadius: 16, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(0,168,132,0.18)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  section: { gap: 8 },
  sectionTitle: { color: colors.title, fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' },
  empty: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '800', textAlign: 'center', paddingVertical: 8 },
  row: { minHeight: 58, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rowSelected: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.22)' },
  smallAvatar: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  rowSub: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  adminText: { color: colors.header, fontWeight: '900' },
  iconActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  dangerIconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.header, fontSize: 9.5, lineHeight: 12, fontWeight: '900' },
  checkCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checkCircleSelected: { borderColor: colors.header, backgroundColor: colors.header },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  leaveButton: { minHeight: 44, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  leaveButtonText: { color: colors.danger, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
