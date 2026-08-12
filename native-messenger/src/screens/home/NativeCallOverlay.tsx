import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraOff, Mic, MicOff, MoreHorizontal, Phone, PhoneOff, Share2, UserPlus, Volume2, X } from 'lucide-react-native';
import { RTCView } from '@livekit/react-native-webrtc';
import type { useNativeCall } from '@/hooks/useNativeCall';
import type { Conversation } from '@/types/messenger';
import { conversationAvatar, highQualityImageUri } from './homeUtils';

type NativeCallController = ReturnType<typeof useNativeCall>;

type NativeCallOverlayProps = {
  call: NativeCallController;
  conversation?: Conversation | null;
  currentUserId?: string;
};

export function NativeCallOverlay({ call, conversation, currentUserId }: NativeCallOverlayProps) {
  const insets = useSafeAreaInsets();
  const [expandedVideo, setExpandedVideo] = useState<string | 'local' | null>(null);

  useEffect(() => {
    if (call.callState === 'idle' || call.callInfo?.type !== 'video') setExpandedVideo(null);
  }, [call.callInfo?.callId, call.callInfo?.type, call.callState]);

  if (call.callState === 'idle') return null;
  const remoteEntries = Array.from(call.remoteStreams.entries());
  const isVideo = call.callInfo?.type === 'video';
  const peer = conversation?.participants.find(participant => participant.id !== currentUserId);
  const displayName = conversation?.name || peer?.name || call.callInfo?.calleeName || call.callInfo?.callerName || 'Oracle Messenger';
  const displayAvatar = highQualityImageUri(peer?.avatar || call.callInfo?.calleeAvatar || conversationAvatar(conversation));
  const expandedRemote = expandedVideo && expandedVideo !== 'local'
    ? remoteEntries.find(([userId]) => userId === expandedVideo)
    : undefined;
  const mainRemote = expandedRemote || (remoteEntries.length === 1 ? remoteEntries[0] : undefined);
  const showLocalAsMain = isVideo && expandedVideo === 'local' && Boolean(call.localStream);
  const pipRemote = showLocalAsMain ? remoteEntries[0] : undefined;
  const addableParticipantIds = (conversation?.participants || [])
    .map(participant => participant.id)
    .filter(userId => userId && userId !== currentUserId && !call.callInfo?.participants.includes(userId));
  const status =
    call.callState === 'incoming' ? 'Appel entrant' :
    call.callState === 'calling' ? 'Appel en cours...' :
    call.callState === 'connecting' ? 'Connexion...' :
    call.callState === 'reconnecting' ? 'Reconnexion...' :
    call.callState === 'ended' ? 'Appel terminé' :
    call.callState === 'connected' ? 'Connecté' : 'Appel';
  const shareCurrentCall = async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: `Appel Oracle Messenger avec ${displayName}.`,
    }).catch(() => undefined);
  };

  return (
    <View style={[styles.callOverlay, { paddingTop: Math.max(insets.top + 16, 58), paddingBottom: Math.max(insets.bottom + 18, 28) }]}>
      <View style={styles.topActionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer l’appel" disabled={call.callState === 'ended'} onPress={call.endCall} style={[styles.topCircle, call.callState === 'ended' && styles.controlDisabled]}>
          <X size={36} color="#FFFFFF" strokeWidth={2.5} />
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
          disabled={!addableParticipantIds.length || call.callState === 'ended'}
          onPress={() => call.addParticipants(addableParticipantIds)}
          style={[styles.topCircle, (!addableParticipantIds.length || call.callState === 'ended') && styles.controlDisabled]}
        >
          <UserPlus size={32} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
      </View>

      {showLocalAsMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Réduire ma vidéo"
          onPress={() => setExpandedVideo(null)}
          style={styles.remoteVideoButton}
        >
          {call.isCameraOff ? (
            <View style={styles.mainVideoOff}><CameraOff size={42} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream!.toURL()} objectFit="cover" mirror style={styles.remoteVideo} />
          )}
        </Pressable>
      ) : isVideo && mainRemote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandedRemote ? 'Réduire la vidéo' : 'Agrandir la vidéo'}
          onPress={() => setExpandedVideo(expandedRemote ? null : mainRemote[0])}
          style={styles.remoteVideoButton}
        >
          <RTCView streamURL={mainRemote[1].toURL()} objectFit="cover" style={styles.remoteVideo} />
        </Pressable>
      ) : isVideo && remoteEntries.length > 1 ? (
          <View style={styles.remoteGrid}>
            {remoteEntries.slice(0, 6).map(([userId, stream]) => (
              <Pressable
                key={userId}
                accessibilityRole="button"
                accessibilityLabel="Agrandir cette vidéo"
                onPress={() => setExpandedVideo(userId)}
                style={styles.remoteGridVideo}
              >
                <RTCView streamURL={stream.toURL()} objectFit="cover" style={styles.videoFill} />
              </Pressable>
            ))}
          </View>
      ) : (
        <View style={styles.callAvatar}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar, cache: 'force-cache' }} resizeMethod="auto" style={styles.callAvatarImage} />
          ) : (
            <Text style={styles.callAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
      )}

      {isVideo && pipRemote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agrandir la vidéo distante"
          onPress={() => setExpandedVideo(pipRemote[0])}
          style={styles.localVideoWrap}
        >
          <RTCView streamURL={pipRemote[1].toURL()} objectFit="cover" style={styles.localVideo} />
        </Pressable>
      ) : isVideo && call.localStream && !showLocalAsMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agrandir ma vidéo"
          onPress={() => setExpandedVideo('local')}
          style={styles.localVideoWrap}
        >
          {call.isCameraOff ? (
            <View style={styles.localVideoOff}><CameraOff size={22} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream.toURL()} objectFit="cover" mirror style={styles.localVideo} />
          )}
        </Pressable>
      ) : null}

      <View style={styles.callCenter}>
        <Text style={styles.callProgress}>{status}</Text>
        <View style={styles.networkPill}>
          <View style={styles.networkDot} />
          <Text style={styles.networkText}>{call.callState === 'ended' ? 'Retour à la conversation' : call.callState === 'connected' ? 'Connecté' : 'Réseau en attente'}</Text>
        </View>
        {call.callState === 'ended' ? <ActivityIndicator color="#FFFFFF" /> : null}
        {call.callNotice ? <Text style={styles.callNotice}>{call.callNotice}</Text> : null}
        <Text style={styles.callHint}>{call.callState === 'ended' ? 'Nettoyage audio et retour en cours.' : 'Garde l’application ouverte pour une sonnerie et une connexion plus fiables.'}</Text>
      </View>

      <View style={styles.callControls}>
        {call.callState === 'ended' ? null : call.callState === 'incoming' ? (
          <>
            <Pressable style={[styles.callControl, styles.endControl]} onPress={() => call.answerCall(false)}>
              <PhoneOff size={24} color="#FFFFFF" />
              <Text style={styles.callControlLabel}>Refuser</Text>
            </Pressable>
            <Pressable style={[styles.callControl, styles.acceptControl]} onPress={() => call.answerCall(true)}>
              <Phone size={24} color="#FFFFFF" />
              <Text style={styles.callControlLabel}>Répondre</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.callControl, call.speakerOn && styles.callControlActive]} onPress={call.toggleSpeaker}>
              <View style={[styles.callControlIcon, call.speakerOn && styles.callControlActiveIcon]}><Volume2 size={30} color="#FFFFFF" /></View>
              <Text style={styles.callControlLabel}>Haut-parleur</Text>
            </Pressable>
            <Pressable style={[styles.callControl, !isVideo && styles.controlDisabled, isVideo && call.isCameraOff && styles.callControlActive]} disabled={!isVideo} onPress={call.toggleCamera}>
              <View style={[styles.callControlIcon, isVideo && call.isCameraOff && styles.callControlActiveIcon]}>{isVideo && call.isCameraOff ? <CameraOff size={30} color="#FFFFFF" /> : <Camera size={30} color="#FFFFFF" />}</View>
              <Text style={styles.callControlLabel}>Vidéo</Text>
            </Pressable>
            <Pressable style={[styles.callControl, call.isMuted && styles.callControlActive]} onPress={call.toggleMute}>
              <View style={[styles.callControlIcon, call.isMuted && styles.callControlActiveIcon]}>{call.isMuted ? <MicOff size={30} color="#FFFFFF" /> : <Mic size={30} color="#FFFFFF" />}</View>
              <Text style={styles.callControlLabel}>{call.isMuted ? 'Activer le micro' : 'Désactiver le micro'}</Text>
            </Pressable>
            <Pressable style={[styles.callControl, !addableParticipantIds.length && styles.controlDisabled]} disabled={!addableParticipantIds.length} onPress={() => call.addParticipants(addableParticipantIds)}>
              <View style={styles.callControlIcon}><MoreHorizontal size={31} color="#FFFFFF" /></View>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#07100F', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 28 },
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
  callAvatar: { zIndex: 1, width: 236, height: 236, borderRadius: 118, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)', marginTop: 22, overflow: 'hidden' },
  callAvatarImage: { width: '100%', height: '100%' },
  callAvatarText: { color: '#FFFFFF', fontSize: 82, fontWeight: '900' },
  callCenter: { zIndex: 2, width: '100%', alignItems: 'center', gap: 12 },
  callProgress: { color: 'rgba(255,255,255,0.70)', fontSize: 18, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  networkPill: { minHeight: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  networkDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FACC15' },
  networkText: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 19, fontWeight: '900' },
  callHint: { maxWidth: 320, color: 'rgba(255,255,255,0.55)', fontSize: 15.5, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  localVideoWrap: { position: 'absolute', right: 18, top: 110, zIndex: 3, width: 104, height: 144, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#111827' },
  localVideo: { width: '100%', height: '100%' },
  localVideoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  callControls: { zIndex: 2, width: '100%', maxWidth: 430, minHeight: 248, borderRadius: 30, padding: 18, backgroundColor: 'rgba(0,20,18,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  callControl: { width: '30%', minHeight: 96, alignItems: 'center', justifyContent: 'flex-start', gap: 9 },
  callControlIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  callControlActive: { opacity: 1 },
  callControlActiveIcon: { backgroundColor: 'rgba(0,168,132,0.82)', borderColor: 'rgba(255,255,255,0.22)' },
  controlDisabled: { opacity: 0.35 },
  callControlLabel: { color: '#FFFFFF', fontSize: 15, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  endControl: {},
  acceptControl: {},
  endIcon: { backgroundColor: '#E9004D', shadowColor: '#E9004D', shadowOpacity: 0.42, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
