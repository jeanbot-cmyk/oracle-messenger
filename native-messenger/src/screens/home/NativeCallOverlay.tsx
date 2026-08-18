import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, InteractionManager, Modal, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraOff, Minimize2, Mic, MicOff, MoreHorizontal, Phone, PhoneOff, Share2, UserPlus, Volume2, X } from 'lucide-react-native';
import { RTCView } from '@livekit/react-native-webrtc';
import type { useNativeCall } from '@/hooks/useNativeCall';
import type { Conversation, Participant } from '@/types/messenger';
import { conversationAvatar, fastAvatarUri } from './homeUtils';

type NativeCallController = ReturnType<typeof useNativeCall>;

type NativeCallOverlayProps = {
  call: NativeCallController;
  conversation?: Conversation | null;
  knownCallParticipants?: Participant[];
  currentUserId?: string;
  callParticipantsLoading?: boolean;
  onLoadCallParticipants?: () => Promise<void> | void;
};

const MAX_AUDIO_CALL_PARTICIPANTS = 100;
const MAX_VIDEO_CALL_PARTICIPANTS = 10;

const VIDEO_CONTROLS_HIDE_MS = 2_000;
const MINIMIZED_CALL_WIDTH = 286;
const MINIMIZED_CALL_HEIGHT = 116;
const MINIMIZED_CALL_EDGE = 10;

type FloatingPosition = { x: number; y: number };

function formatCallDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function NativeCallOverlay({
  call,
  conversation,
  knownCallParticipants = [],
  currentUserId,
  callParticipantsLoading = false,
  onLoadCallParticipants,
}: NativeCallOverlayProps) {
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const [expandedVideo, setExpandedVideo] = useState<string | 'local' | null>(null);
  const [participantPickerOpen, setParticipantPickerOpen] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [acceptLift, setAcceptLift] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [minimizedPosition, setMinimizedPosition] = useState<FloatingPosition | null>(null);
  const [connectedSeconds, setConnectedSeconds] = useState(0);
  const [answerBusy, setAnswerBusy] = useState(false);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptPulseRef = useRef(new Animated.Value(1));
  const connectedAtRef = useRef<number | null>(null);
  const minimizedPositionRef = useRef<FloatingPosition | null>(null);
  const minimizedDragStartRef = useRef<FloatingPosition>({ x: 0, y: 0 });
  const bottomSafePadding = Math.max(insets.bottom + 58, 92);
  const isVideo = call.callInfo?.type === 'video';
  const canAutoHideVideoChrome = Boolean(
    isVideo && ['connected', 'connecting', 'reconnecting'].includes(call.callState),
  );
  const isIncoming = call.callState === 'incoming';
  const clampMinimizedPosition = useCallback((position: FloatingPosition) => {
    const maxX = Math.max(MINIMIZED_CALL_EDGE, windowSize.width - MINIMIZED_CALL_WIDTH - MINIMIZED_CALL_EDGE);
    const minY = Math.max(MINIMIZED_CALL_EDGE, insets.top + MINIMIZED_CALL_EDGE);
    const maxY = Math.max(minY, windowSize.height - MINIMIZED_CALL_HEIGHT - Math.max(insets.bottom, MINIMIZED_CALL_EDGE) - MINIMIZED_CALL_EDGE);
    return {
      x: Math.max(MINIMIZED_CALL_EDGE, Math.min(maxX, position.x)),
      y: Math.max(minY, Math.min(maxY, position.y)),
    };
  }, [insets.bottom, insets.top, windowSize.height, windowSize.width]);

  const defaultMinimizedPosition = useCallback(() => clampMinimizedPosition({
    x: windowSize.width - MINIMIZED_CALL_WIDTH - 14,
    y: windowSize.height - MINIMIZED_CALL_HEIGHT - Math.max(insets.bottom + 86, 104),
  }), [clampMinimizedPosition, insets.bottom, windowSize.height, windowSize.width]);

  const clearControlsHideTimer = useCallback(() => {
    if (!controlsHideTimerRef.current) return;
    clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
  }, []);

  const showVideoControls = useCallback(() => {
    if (!isVideo) return;
    clearControlsHideTimer();
    setControlsVisible(true);
    if (!canAutoHideVideoChrome) return;
    controlsHideTimerRef.current = setTimeout(() => {
      controlsHideTimerRef.current = null;
      setControlsVisible(false);
    }, VIDEO_CONTROLS_HIDE_MS);
  }, [canAutoHideVideoChrome, clearControlsHideTimer, isVideo]);

  useEffect(() => {
    if (call.callState === 'idle' || call.callInfo?.type !== 'video') setExpandedVideo(null);
  }, [call.callInfo?.callId, call.callInfo?.type, call.callState]);

  useEffect(() => {
    setParticipantPickerOpen(false);
    setSelectedParticipantIds([]);
    setControlsVisible(true);
    clearControlsHideTimer();
  }, [call.callInfo?.callId, clearControlsHideTimer]);

  useEffect(() => {
    if (call.callState === 'idle' || call.callState === 'incoming' || call.callState === 'ended') {
      setMinimized(false);
    }
    if (call.callState !== 'incoming') setAnswerBusy(false);
  }, [call.callState]);

  useEffect(() => {
    if (!minimized) return;
    setMinimizedPosition(current => {
      const next = current ? clampMinimizedPosition(current) : defaultMinimizedPosition();
      minimizedPositionRef.current = next;
      return next;
    });
  }, [clampMinimizedPosition, defaultMinimizedPosition, minimized]);

  useEffect(() => {
    if (call.callState !== 'connected') {
      connectedAtRef.current = null;
      setConnectedSeconds(0);
      return undefined;
    }
    if (!connectedAtRef.current) connectedAtRef.current = Date.now();
    const tick = () => {
      const connectedAt = connectedAtRef.current || Date.now();
      setConnectedSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call.callInfo?.callId, call.callState]);

  useEffect(() => {
    if (!isIncoming) {
      acceptPulseRef.current.stopAnimation();
      acceptPulseRef.current.setValue(1);
      setAcceptLift(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(acceptPulseRef.current, { toValue: 1.08, duration: 420, useNativeDriver: true }),
        Animated.timing(acceptPulseRef.current, { toValue: 0.98, duration: 420, useNativeDriver: true }),
        Animated.timing(acceptPulseRef.current, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isIncoming]);

  const answerIncomingCall = useCallback(async (accepted: boolean) => {
    if (!isIncoming || answerBusy) return;
    setAnswerBusy(true);
    try {
      await call.answerCall(accepted);
    } finally {
      setAnswerBusy(false);
    }
  }, [answerBusy, call, isIncoming]);

  const incomingAcceptResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      isIncoming &&
      Math.abs(gesture.dy) > 8 &&
      Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderMove: (_event, gesture) => {
      if (!isIncoming) return;
      setAcceptLift(Math.max(0, Math.min(1, -gesture.dy / 92)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!isIncoming) {
        setAcceptLift(0);
        return;
      }
      const shouldAccept = gesture.dy < -64 || gesture.vy < -0.72;
      setAcceptLift(0);
      if (shouldAccept) void answerIncomingCall(true);
    },
    onPanResponderTerminate: () => setAcceptLift(0),
  }), [answerIncomingCall, isIncoming]);

  const minimizedCallPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      minimized &&
      Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8
    ),
    onPanResponderGrant: () => {
      minimizedDragStartRef.current = minimizedPositionRef.current || defaultMinimizedPosition();
    },
    onPanResponderMove: (_event, gesture) => {
      const start = minimizedDragStartRef.current;
      const next = clampMinimizedPosition({
        x: start.x + gesture.dx,
        y: start.y + gesture.dy,
      });
      minimizedPositionRef.current = next;
      setMinimizedPosition(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const start = minimizedDragStartRef.current;
      const next = clampMinimizedPosition({
        x: start.x + gesture.dx,
        y: start.y + gesture.dy,
      });
      minimizedPositionRef.current = next;
      setMinimizedPosition(next);
    },
    onPanResponderTerminate: () => {
      setMinimizedPosition(minimizedPositionRef.current || defaultMinimizedPosition());
    },
  }), [clampMinimizedPosition, defaultMinimizedPosition, minimized]);

  useEffect(() => {
    if (!canAutoHideVideoChrome) {
      clearControlsHideTimer();
      setControlsVisible(true);
      return undefined;
    }
    showVideoControls();
    return clearControlsHideTimer;
  }, [canAutoHideVideoChrome, clearControlsHideTimer, showVideoControls]);

  const addableParticipants = useMemo(() => {
    const byId = new Map<string, Participant>();
    [...(conversation?.participants || []), ...knownCallParticipants].forEach(participant => {
      if (!participant?.id) return;
      if (participant.id === currentUserId) return;
      if (participant.id === call.callInfo?.callerId) return;
      if (call.callInfo?.participants.includes(participant.id)) return;
      byId.set(participant.id, participant);
    });
    return Array.from(byId.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [call.callInfo?.callerId, call.callInfo?.participants, conversation?.participants, currentUserId, knownCallParticipants]);
  const participantLimit = call.callInfo?.type === 'video' ? MAX_VIDEO_CALL_PARTICIPANTS : MAX_AUDIO_CALL_PARTICIPANTS;
  const activeParticipantCount = new Set([call.callInfo?.callerId, ...(call.callInfo?.participants || [])].filter(Boolean)).size;
  const remainingParticipantSlots = Math.max(0, participantLimit - activeParticipantCount);
  const canAddParticipants = Boolean(
    call.callInfo &&
    ['calling', 'ringing', 'connecting', 'connected', 'reconnecting'].includes(call.callState) &&
    remainingParticipantSlots > 0,
  );
  const addableParticipantIds = useMemo(
    () => addableParticipants.slice(0, remainingParticipantSlots).map(participant => participant.id),
    [addableParticipants, remainingParticipantSlots],
  );

  useEffect(() => {
    if (!participantPickerOpen) return;
    setSelectedParticipantIds(current => {
      const available = new Set(addableParticipantIds);
      const next = current.filter(id => available.has(id));
      if (!next.length && addableParticipantIds.length === 1) return [addableParticipantIds[0]];
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
  }, [addableParticipantIds, participantPickerOpen]);

  const peer = conversation?.participants.find(participant => participant.id !== currentUserId);
  const callPeerId = call.callInfo?.callerId === currentUserId
    ? call.callInfo?.participants.find(userId => userId !== currentUserId)
    : call.callInfo?.callerId;
  const knownPeer = knownCallParticipants.find(participant => participant.id === callPeerId);
  const displayPeer = peer || knownPeer;
  const displayName = conversation?.name
    || displayPeer?.name
    || call.callInfo?.calleePhone
    || call.callInfo?.callerPhone
    || 'Contact Oracle';
  const displayAvatar = fastAvatarUri(displayPeer?.avatar || conversationAvatar(conversation));

  useEffect(() => {
    if (!displayAvatar) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      Image.prefetch(displayAvatar).catch(() => undefined);
    });
    return () => task.cancel();
  }, [displayAvatar]);

  useEffect(() => {
    if (!participantPickerOpen) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      addableParticipants.slice(0, 20).forEach(participant => {
        const avatar = fastAvatarUri(participant.avatar);
        if (avatar) Image.prefetch(avatar).catch(() => undefined);
      });
    });
    return () => task.cancel();
  }, [addableParticipants, participantPickerOpen]);

  if (call.callState === 'idle') return null;
  const remoteEntries = Array.from(call.remoteStreams.entries());
  const remoteVideoEntries = remoteEntries.filter(([, stream]) => stream.getVideoTracks().some(track => track.enabled !== false));
  const showChrome = !canAutoHideVideoChrome || controlsVisible;
  const expandedRemote = expandedVideo && expandedVideo !== 'local'
    ? remoteVideoEntries.find(([userId]) => userId === expandedVideo)
    : undefined;
  const mainRemote = expandedRemote || (remoteVideoEntries.length === 1 ? remoteVideoEntries[0] : undefined);
  const showLocalAsMain = isVideo && expandedVideo === 'local' && Boolean(call.localStream);
  const pipRemote = showLocalAsMain ? remoteVideoEntries[0] : undefined;
  const status =
    call.callState === 'incoming' ? 'Appel entrant' :
    call.callState === 'searching' ? 'Appel en cours...' :
    call.callState === 'calling' ? 'Appel en cours...' :
    call.callState === 'ringing' ? 'En attente de connexion...' :
    call.callState === 'connecting' ? 'Connexion...' :
    call.callState === 'reconnecting' ? 'Reconnexion...' :
    call.callState === 'ended' ? 'Appel terminé' :
    call.callState === 'connected' ? 'Connecté' : 'Appel';
  const durationText = connectedSeconds > 0 ? formatCallDuration(connectedSeconds) : '00:00';
  const canMinimizeCall = !['incoming', 'ended'].includes(call.callState);
  const shareCurrentCall = async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: `Appel Oracle Messenger avec ${displayName}.`,
    }).catch(() => undefined);
  };
  const openParticipantPicker = async () => {
    if (!canAddParticipants || call.callState === 'ended') return;
    setSelectedParticipantIds(addableParticipants.length === 1 ? [addableParticipants[0].id] : []);
    setParticipantPickerOpen(true);
    await onLoadCallParticipants?.();
  };
  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds(current => current.includes(userId)
      ? current.filter(id => id !== userId)
      : current.length >= remainingParticipantSlots
        ? current
        : [...current, userId]);
  };
  const inviteSelectedParticipants = () => {
    if (!selectedParticipantIds.length) return;
    call.addParticipants(selectedParticipantIds);
    setParticipantPickerOpen(false);
    setSelectedParticipantIds([]);
  };

  if (minimized) {
    const floatingPosition = minimizedPosition || defaultMinimizedPosition();
    return (
      <View pointerEvents="box-none" style={styles.minimizedCallLayer}>
        <View
          style={[styles.minimizedCallFloating, { left: floatingPosition.x, top: floatingPosition.y }]}
          {...minimizedCallPanResponder.panHandlers}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rouvrir l’appel"
            onPress={() => setMinimized(false)}
            style={styles.minimizedCallBubble}
          >
            <View style={styles.minimizedAvatar}>
              {isVideo && call.localStream && !call.isCameraOff ? (
                <RTCView streamURL={call.localStream.toURL()} objectFit="cover" mirror style={styles.minimizedVideo} />
              ) : displayAvatar ? (
                <Image source={{ uri: displayAvatar, cache: 'force-cache' }} resizeMode="cover" style={styles.minimizedVideo} />
              ) : (
                <Text style={styles.minimizedAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.minimizedTextWrap}>
              <Text numberOfLines={1} style={styles.minimizedTitle}>{displayName}</Text>
              <Text numberOfLines={1} style={styles.minimizedMeta}>
                {call.callState === 'connected' ? durationText : status}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Terminer l’appel réduit"
            onPress={call.endCall}
            style={styles.minimizedEndButton}
          >
            <PhoneOff size={22} color="#FFFFFF" />
          </Pressable>
          <View pointerEvents="none" style={styles.minimizedDragHint}>
            <MoreHorizontal size={16} color="rgba(255,255,255,0.48)" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.callOverlay, { paddingTop: Math.max(insets.top + 16, 58), paddingBottom: bottomSafePadding }]}>
      <Modal visible={participantPickerOpen} transparent animationType="fade" onRequestClose={() => setParticipantPickerOpen(false)}>
        <View style={styles.participantModalBackdrop}>
          <View style={styles.participantModal}>
            <View style={styles.participantModalHeader}>
              <Text style={styles.participantModalTitle}>Ajouter à l’appel</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setParticipantPickerOpen(false)} style={styles.participantModalClose}>
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView style={styles.participantList} contentContainerStyle={styles.participantListContent}>
              {callParticipantsLoading ? (
                <View style={styles.participantEmptyState}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.participantEmptyText}>Chargement des contacts...</Text>
                </View>
              ) : null}
              {!callParticipantsLoading && !addableParticipants.length ? (
                <Text style={styles.participantEmptyText}>Aucun contact disponible à ajouter à cet appel.</Text>
              ) : null}
              {addableParticipants.map(participant => {
                const selected = selectedParticipantIds.includes(participant.id);
                return (
                  <Pressable key={participant.id} accessibilityRole="button" onPress={() => toggleParticipant(participant.id)} style={[styles.participantRow, selected && styles.participantRowSelected]}>
                    <View style={styles.participantAvatar}>
                      {participant.avatar ? (
                        <Image source={{ uri: fastAvatarUri(participant.avatar) || participant.avatar, cache: 'force-cache' }} resizeMode="cover" style={styles.participantAvatarImage} />
                      ) : (
                        <Text style={styles.participantAvatarText}>{(participant.name || participant.username || '?').slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={styles.participantTextWrap}>
                      <Text numberOfLines={1} style={styles.participantName}>{participant.name || participant.username || 'Contact'}</Text>
                      <Text numberOfLines={1} style={styles.participantMeta}>{selected ? 'Sélectionné' : 'Disponible'}</Text>
                    </View>
                    <View style={[styles.participantCheck, selected && styles.participantCheckSelected]}>
                      {selected ? <Text style={styles.participantCheckText}>✓</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.participantActions}>
              <Pressable accessibilityRole="button" onPress={() => setSelectedParticipantIds(addableParticipantIds)} style={styles.participantSecondaryButton}>
                <Text style={styles.participantSecondaryText}>Tous</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!selectedParticipantIds.length}
                onPress={inviteSelectedParticipants}
                style={[styles.participantInviteButton, !selectedParticipantIds.length && styles.controlDisabled]}
              >
                <Text style={styles.participantInviteText}>Inviter{selectedParticipantIds.length ? ` (${selectedParticipantIds.length})` : ''}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {showChrome ? <View style={styles.topActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canMinimizeCall ? 'Réduire l’appel' : 'Fermer l’appel'}
          disabled={call.callState === 'ended'}
          onPress={canMinimizeCall ? () => setMinimized(true) : call.endCall}
          style={[styles.topCircle, call.callState === 'ended' && styles.controlDisabled]}
        >
          {canMinimizeCall ? <Minimize2 size={32} color="#FFFFFF" strokeWidth={2.5} /> : <X size={36} color="#FFFFFF" strokeWidth={2.5} />}
        </Pressable>
        <View style={styles.callIdentity}>
          <Text numberOfLines={1} style={styles.callTitle}>{displayName}</Text>
          <View style={styles.encryptionRow}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.callStatus}>Chiffré de bout en bout</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un participant"
          disabled={!canAddParticipants || callParticipantsLoading}
          onPress={openParticipantPicker}
          style={[styles.topCircle, (!canAddParticipants || callParticipantsLoading) && styles.controlDisabled]}
        >
          {callParticipantsLoading ? <ActivityIndicator color="#FFFFFF" /> : <UserPlus size={32} color="#FFFFFF" strokeWidth={2.5} />}
        </Pressable>
      </View> : null}

      {showLocalAsMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Réduire ma vidéo"
          onPress={() => {
            const canChangeVideo = showChrome;
            showVideoControls();
            if (canChangeVideo) setExpandedVideo(null);
          }}
          style={styles.remoteVideoButton}
        >
          {call.isCameraOff ? (
            <View style={styles.mainVideoOff}><CameraOff size={42} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream!.toURL()} objectFit="contain" mirror style={styles.remoteVideo} />
          )}
        </Pressable>
      ) : isVideo && mainRemote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandedRemote ? 'Réduire la vidéo' : 'Agrandir la vidéo'}
          onPress={() => {
            const canChangeVideo = showChrome;
            showVideoControls();
            if (canChangeVideo) setExpandedVideo(expandedRemote ? null : mainRemote[0]);
          }}
          style={styles.remoteVideoButton}
        >
          <RTCView streamURL={mainRemote[1].toURL()} objectFit="contain" style={styles.remoteVideo} />
        </Pressable>
      ) : isVideo && remoteVideoEntries.length > 1 ? (
          <View style={styles.remoteGrid}>
            {remoteVideoEntries.slice(0, 6).map(([userId, stream]) => (
              <Pressable
                key={userId}
                accessibilityRole="button"
                accessibilityLabel="Agrandir cette vidéo"
                onPress={() => {
                  const canChangeVideo = showChrome;
                  showVideoControls();
                  if (canChangeVideo) setExpandedVideo(userId);
                }}
                style={styles.remoteGridVideo}
              >
                <RTCView streamURL={stream.toURL()} objectFit="contain" style={styles.videoFill} />
              </Pressable>
            ))}
          </View>
      ) : (
        <Pressable
          disabled={!isVideo}
          onPress={showVideoControls}
          style={styles.callAvatar}
        >
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar, cache: 'force-cache' }} resizeMethod="auto" resizeMode="cover" style={styles.callAvatarImage} />
          ) : (
            <Text style={styles.callAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
          )}
        </Pressable>
      )}

      {!isVideo ? (
        <View pointerEvents="none" style={styles.hiddenRemoteAudio}>
          {remoteEntries.map(([userId, stream]) => (
            <RTCView key={userId} streamURL={stream.toURL()} objectFit="cover" style={styles.hiddenRemoteAudioStream} />
          ))}
        </View>
      ) : null}

      {isVideo && pipRemote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agrandir la vidéo distante"
          onPress={() => {
            const canChangeVideo = showChrome;
            showVideoControls();
            if (canChangeVideo) setExpandedVideo(pipRemote[0]);
          }}
          style={styles.localVideoWrap}
        >
          <RTCView streamURL={pipRemote[1].toURL()} objectFit="cover" style={styles.localVideo} />
        </Pressable>
      ) : isVideo && call.localStream && !showLocalAsMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agrandir ma vidéo"
          onPress={() => {
            const canChangeVideo = showChrome;
            showVideoControls();
            if (canChangeVideo) setExpandedVideo('local');
          }}
          style={styles.localVideoWrap}
        >
          {call.isCameraOff ? (
            <View style={styles.localVideoOff}><CameraOff size={22} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream.toURL()} objectFit="cover" mirror style={styles.localVideo} />
          )}
        </Pressable>
      ) : null}

      {showChrome ? <View style={styles.callCenter}>
        <Text style={styles.callProgress}>{status}</Text>
        {call.callState === 'connected' ? <Text style={styles.callDuration}>{durationText}</Text> : null}
        <View style={styles.networkPill}>
          <View style={styles.networkDot} />
          <Text style={styles.networkText}>{call.callState === 'ended' ? 'Retour à la conversation' : call.callState === 'connected' ? 'Audio actif' : call.callState === 'ringing' ? 'Téléphone distant alerté' : call.callState === 'reconnecting' ? 'Reconnexion' : 'Connexion en cours'}</Text>
        </View>
        {isIncoming ? (
          <View style={styles.incomingAnswerZone}>
            <Text style={styles.incomingAnswerHint}>Glissez vers le haut pour répondre</Text>
            <Animated.View
              style={[
                styles.incomingAnswerButton,
                {
                  transform: [
                    { translateY: -26 * acceptLift },
                    { scale: acceptPulseRef.current },
                  ],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Répondre à l’appel"
                disabled={answerBusy}
                onPress={() => void answerIncomingCall(true)}
                style={[styles.incomingAnswerButtonInner, answerBusy && styles.controlDisabled]}
                {...incomingAcceptResponder.panHandlers}
              >
                {answerBusy ? <ActivityIndicator color="#FFFFFF" /> : <Phone size={42} color="#FFFFFF" strokeWidth={2.7} />}
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
        {call.callState === 'ended' ? <ActivityIndicator color="#FFFFFF" /> : null}
        {call.callNotice ? <Text style={styles.callNotice}>{call.callNotice}</Text> : null}
      </View> : null}

      {showChrome ? <View style={styles.callControls}>
        {call.callState === 'ended' ? null : call.callState === 'incoming' ? (
          <>
            <Pressable disabled={answerBusy} style={[styles.callControl, styles.endControl, answerBusy && styles.controlDisabled]} onPress={() => void answerIncomingCall(false)}>
              <PhoneOff size={24} color="#FFFFFF" />
              <Text style={styles.callControlLabel}>Refuser</Text>
            </Pressable>
            <Pressable disabled={answerBusy} style={[styles.callControl, styles.acceptControl, answerBusy && styles.controlDisabled]} onPress={() => void answerIncomingCall(true)}>
              {answerBusy ? <ActivityIndicator color="#FFFFFF" /> : <Phone size={24} color="#FFFFFF" />}
              <Text style={styles.callControlLabel}>Répondre</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.callControl, call.speakerOn && styles.callControlActive]} onPress={call.toggleSpeaker}>
              <View style={[styles.callControlIcon, call.speakerOn && styles.callControlActiveIcon]}><Volume2 size={30} color="#FFFFFF" /></View>
              <Text style={styles.callControlLabel}>Haut-parleur</Text>
            </Pressable>
            <Pressable style={styles.callControl} onPress={call.toggleCamera}>
              <View style={styles.callControlIcon}>{isVideo ? <Phone size={30} color="#FFFFFF" /> : <Camera size={30} color="#FFFFFF" />}</View>
              <Text style={styles.callControlLabel}>{isVideo ? 'Passer en audio' : 'Passer en vidéo'}</Text>
            </Pressable>
            {isVideo ? (
              <Pressable style={styles.callControl} onPress={call.switchCamera}>
                <View style={styles.callControlIcon}><Camera size={30} color="#FFFFFF" /></View>
                <Text style={styles.callControlLabel}>Retourner</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.callControl, call.isMuted && styles.callControlActive]} onPress={call.toggleMute}>
              <View style={[styles.callControlIcon, call.isMuted && styles.callControlActiveIcon]}>{call.isMuted ? <MicOff size={30} color="#FFFFFF" /> : <Mic size={30} color="#FFFFFF" />}</View>
              <Text style={styles.callControlLabel}>{call.isMuted ? 'Activer le micro' : 'Désactiver le micro'}</Text>
            </Pressable>
            <Pressable style={[styles.callControl, (!canAddParticipants || callParticipantsLoading) && styles.controlDisabled]} disabled={!canAddParticipants || callParticipantsLoading} onPress={openParticipantPicker}>
              <View style={styles.callControlIcon}>{callParticipantsLoading ? <ActivityIndicator color="#FFFFFF" /> : <MoreHorizontal size={31} color="#FFFFFF" />}</View>
              <Text style={styles.callControlLabel}>Ajouter</Text>
            </Pressable>
            <Pressable style={styles.callControl} onPress={shareCurrentCall}>
              <View style={styles.callControlIcon}><Share2 size={31} color="#FFFFFF" /></View>
              <Text style={styles.callControlLabel}>Partager</Text>
            </Pressable>
            <Pressable style={[styles.callControl, styles.endControl]} onPress={call.endCall}>
              <View style={[styles.callControlIcon, styles.endIcon]}><PhoneOff size={30} color="#FFFFFF" /></View>
              <Text style={styles.callControlLabel}>Terminer</Text>
            </Pressable>
          </>
        )}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  callOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#07100F', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 28 },
  participantModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  participantModal: { width: '100%', maxWidth: 430, maxHeight: '78%', borderRadius: 22, backgroundColor: '#07100F', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', padding: 16 },
  participantModalHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  participantModalTitle: { flex: 1, color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '900' },
  participantModalClose: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  participantList: { marginTop: 10 },
  participantListContent: { gap: 8, paddingBottom: 8 },
  participantEmptyState: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 10 },
  participantEmptyText: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 19, fontWeight: '800', textAlign: 'center', paddingVertical: 16 },
  participantRow: { minHeight: 72, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  participantRowSelected: { borderColor: 'rgba(0,168,132,0.78)', backgroundColor: 'rgba(0,168,132,0.18)' },
  participantAvatar: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  participantAvatarImage: { width: '100%', height: '100%' },
  participantAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  participantTextWrap: { flex: 1, minWidth: 0 },
  participantName: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '900' },
  participantMeta: { color: 'rgba(255,255,255,0.56)', fontSize: 13, lineHeight: 17, fontWeight: '800', marginTop: 2 },
  participantCheck: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  participantCheckSelected: { backgroundColor: '#00A884', borderColor: '#00A884' },
  participantCheckText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  participantActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 12 },
  participantSecondaryButton: { minWidth: 82, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.08)' },
  participantSecondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  participantInviteButton: { minWidth: 126, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00A884' },
  participantInviteText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  remoteVideoButton: { ...StyleSheet.absoluteFillObject, zIndex: 0, backgroundColor: '#000000' },
  remoteVideo: { ...StyleSheet.absoluteFillObject, zIndex: 0, backgroundColor: '#000000' },
  remoteGrid: { ...StyleSheet.absoluteFillObject, zIndex: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2, backgroundColor: '#000000' },
  remoteGridVideo: { width: '49.6%', height: '49.6%', backgroundColor: '#000000', overflow: 'hidden' },
  videoFill: { width: '100%', height: '100%', backgroundColor: '#000000' },
  mainVideoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  topActionRow: { zIndex: 2, width: '100%', minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  callIdentity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8 },
  callTitle: { color: '#FFFFFF', fontSize: 27, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  encryptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lockIcon: { color: 'rgba(255,255,255,0.50)', fontSize: 16 },
  callStatus: { color: 'rgba(255,255,255,0.62)', fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  callNotice: { color: '#FDE68A', fontSize: 12, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  minimizedCallLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  minimizedCallFloating: { position: 'absolute', width: MINIMIZED_CALL_WIDTH, height: MINIMIZED_CALL_HEIGHT },
  minimizedCallBubble: { position: 'absolute', left: 0, bottom: 0, width: 246, minHeight: 64, borderRadius: 32, backgroundColor: 'rgba(7,16,15,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 14, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  minimizedAvatar: { width: 48, height: 48, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  minimizedVideo: { width: '100%', height: '100%' },
  minimizedAvatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  minimizedTextWrap: { flex: 1, minWidth: 0 },
  minimizedTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  minimizedMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 1 },
  minimizedEndButton: { position: 'absolute', right: 0, top: 0, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9004D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', elevation: 11, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  minimizedDragHint: { position: 'absolute', left: 96, top: 30, width: 26, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  incomingAnswerZone: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 2 },
  incomingAnswerHint: { color: 'rgba(255,255,255,0.76)', fontSize: 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  incomingAnswerButton: { width: 118, height: 118, borderRadius: 59, backgroundColor: '#00A884', borderWidth: 4, borderColor: 'rgba(255,255,255,0.36)', shadowColor: '#00A884', shadowOpacity: 0.52, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10, overflow: 'hidden' },
  incomingAnswerButtonInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  callAvatar: { zIndex: 1, width: 236, height: 236, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)', marginTop: 22, overflow: 'hidden' },
  callAvatarImage: { width: '100%', height: '100%' },
  callAvatarText: { color: '#FFFFFF', fontSize: 82, fontWeight: '900' },
  hiddenRemoteAudio: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10, overflow: 'hidden' },
  hiddenRemoteAudioStream: { width: 1, height: 1 },
  callCenter: { zIndex: 2, width: '100%', alignItems: 'center', gap: 12 },
  callProgress: { color: 'rgba(255,255,255,0.70)', fontSize: 18, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  callDuration: { color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: '900', textAlign: 'center' },
  networkPill: { minHeight: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  networkDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FACC15' },
  networkText: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 19, fontWeight: '900' },
  localVideoWrap: { position: 'absolute', right: 18, top: 110, zIndex: 3, width: 104, height: 144, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#111827' },
  localVideo: { width: '100%', height: '100%' },
  localVideoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  callControls: { zIndex: 2, width: '100%', maxWidth: 430, minHeight: 248, borderRadius: 30, padding: 18, marginBottom: 10, backgroundColor: 'rgba(0,20,18,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  callControl: { width: '30%', minHeight: 96, alignItems: 'center', justifyContent: 'flex-start', gap: 9 },
  callControlIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  callControlActive: { opacity: 1 },
  callControlActiveIcon: { backgroundColor: 'rgba(0,168,132,0.82)', borderColor: 'rgba(255,255,255,0.22)' },
  controlDisabled: { opacity: 0.35 },
  callControlLabel: { color: '#FFFFFF', fontSize: 15, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  endControl: {},
  acceptControl: { opacity: 1 },
  endIcon: { backgroundColor: '#E9004D', shadowColor: '#E9004D', shadowOpacity: 0.42, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
