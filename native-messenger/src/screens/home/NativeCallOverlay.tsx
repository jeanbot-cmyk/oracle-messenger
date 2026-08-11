import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, RotateCcw, UserPlus, Users, Volume2 } from 'lucide-react-native';
import { RTCView } from 'react-native-webrtc';
import type { useNativeCall } from '@/hooks/useNativeCall';
import type { Conversation } from '@/types/messenger';

type NativeCallController = ReturnType<typeof useNativeCall>;

type NativeCallOverlayProps = {
  call: NativeCallController;
  conversation?: Conversation | null;
  currentUserId?: string;
};

export function NativeCallOverlay({ call, conversation, currentUserId }: NativeCallOverlayProps) {
  if (call.callState === 'idle') return null;
  const remoteEntries = Array.from(call.remoteStreams.entries());
  const isVideo = call.callInfo?.type === 'video';
  const participantCount = Math.max(1, 1 + (call.callInfo?.participants.length || remoteEntries.length));
  const addableParticipantIds = (conversation?.participants || [])
    .map(participant => participant.id)
    .filter(userId => userId && userId !== currentUserId && !call.callInfo?.participants.includes(userId));
  const status =
    call.callState === 'incoming' ? 'Appel entrant' :
    call.callState === 'calling' ? 'Appel en cours...' :
    call.callState === 'connecting' ? 'Connexion...' :
    call.callState === 'reconnecting' ? 'Reconnexion...' :
    call.callState === 'connected' ? 'Connecté' : 'Appel';

  return (
    <View style={styles.callOverlay}>
      {isVideo && remoteEntries.length ? (
        remoteEntries.length === 1 ? (
          <RTCView streamURL={remoteEntries[0][1].toURL()} objectFit="cover" style={styles.remoteVideo} />
        ) : (
          <View style={styles.remoteGrid}>
            {remoteEntries.slice(0, 6).map(([userId, stream]) => (
              <RTCView key={userId} streamURL={stream.toURL()} objectFit="cover" style={styles.remoteGridVideo} />
            ))}
          </View>
        )
      ) : (
        <View style={styles.callAvatar}>
          <Text style={styles.callAvatarText}>{(call.callInfo?.callerName || 'O').slice(0, 1).toUpperCase()}</Text>
        </View>
      )}

      {isVideo && call.localStream ? (
        <View style={styles.localVideoWrap}>
          {call.isCameraOff ? (
            <View style={styles.localVideoOff}><CameraOff size={22} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream.toURL()} objectFit="cover" mirror style={styles.localVideo} />
          )}
        </View>
      ) : null}

      <View style={styles.callTop}>
        <Text style={styles.callTitle}>{call.callInfo?.callerName || 'Oracle Messenger'}</Text>
        <Text style={styles.callStatus}>{status}</Text>
        <View style={styles.participantPill}>
          <Users size={14} color="#FFFFFF" />
          <Text style={styles.participantPillText}>{participantCount}</Text>
        </View>
        {call.callNotice ? <Text style={styles.callNotice}>{call.callNotice}</Text> : null}
      </View>

      <View style={styles.callControls}>
        {call.callState === 'incoming' ? (
          <>
            <Pressable style={[styles.callButton, styles.rejectButton]} onPress={() => call.answerCall(false)}>
              <PhoneOff size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.callButton, styles.acceptButton]} onPress={() => call.answerCall(true)}>
              <Phone size={24} color="#FFFFFF" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.callControl, call.speakerOn && styles.callControlActive]} onPress={call.toggleSpeaker}>
              <Volume2 size={22} color="#FFFFFF" />
              <Text style={styles.callControlLabel}>Haut-parleur</Text>
            </Pressable>
            <Pressable style={[styles.callControl, call.isMuted && styles.callControlActive]} onPress={call.toggleMute}>
              {call.isMuted ? <MicOff size={22} color="#FFFFFF" /> : <Mic size={22} color="#FFFFFF" />}
              <Text style={styles.callControlLabel}>Micro</Text>
            </Pressable>
            {isVideo ? (
              <>
                <Pressable style={[styles.callControl, call.isCameraOff && styles.callControlActive]} onPress={call.toggleCamera}>
                  {call.isCameraOff ? <CameraOff size={22} color="#FFFFFF" /> : <Camera size={22} color="#FFFFFF" />}
                  <Text style={styles.callControlLabel}>Caméra</Text>
                </Pressable>
                <Pressable style={styles.callControl} onPress={call.switchCamera}>
                  <RotateCcw size={22} color="#FFFFFF" />
                  <Text style={styles.callControlLabel}>Tourner</Text>
                </Pressable>
              </>
            ) : null}
            {addableParticipantIds.length ? (
              <Pressable style={styles.callControl} onPress={() => call.addParticipants(addableParticipantIds)}>
                <UserPlus size={22} color="#FFFFFF" />
                <Text style={styles.callControlLabel}>Ajouter</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.callButton, styles.rejectButton]} onPress={call.endCall}>
              <PhoneOff size={24} color="#FFFFFF" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#061514', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 48 },
  remoteVideo: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  remoteGrid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2, backgroundColor: '#000000' },
  remoteGridVideo: { width: '49.6%', height: '49.6%', backgroundColor: '#000000' },
  callTop: { width: '100%', alignItems: 'center', paddingTop: 12 },
  callTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  callStatus: { color: 'rgba(255,255,255,0.76)', fontSize: 14, fontWeight: '800', marginTop: 6 },
  callNotice: { color: '#FDE68A', fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  participantPill: { marginTop: 8, minHeight: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  participantPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  callAvatar: { width: 132, height: 132, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', marginTop: 120 },
  callAvatarText: { color: '#FFFFFF', fontSize: 58, fontWeight: '900' },
  localVideoWrap: { position: 'absolute', right: 18, top: 110, width: 104, height: 144, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#111827' },
  localVideo: { width: '100%', height: '100%' },
  localVideoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  callControls: { width: '100%', maxWidth: 430, minHeight: 96, borderRadius: 28, padding: 12, backgroundColor: 'rgba(0,0,0,0.34)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  callButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { backgroundColor: '#EF4444' },
  acceptButton: { backgroundColor: '#22C55E' },
  callControl: { minWidth: 70, minHeight: 62, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, gap: 4 },
  callControlActive: { backgroundColor: 'rgba(18,140,126,0.72)' },
  callControlLabel: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900', textAlign: 'center' },
});
