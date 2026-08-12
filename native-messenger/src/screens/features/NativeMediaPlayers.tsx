import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, requireNativeComponent, StyleSheet, View, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

export const OracleVideoPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  style?: StyleProp<ViewStyle>;
}>('OracleVideoPlayer');

type OracleAudioPlaybackState = 'preparing' | 'prepared' | 'playing' | 'paused' | 'completed' | 'error';

type OracleAudioPlaybackEvent = NativeSyntheticEvent<{
  state: OracleAudioPlaybackState;
  duration?: number;
  position?: number;
  error?: string;
}>;

const NativeOracleAudioPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  onPlaybackStateChange?: (event: OracleAudioPlaybackEvent) => void;
  style?: StyleProp<ViewStyle>;
}>('OracleAudioPlayer');

type OracleAudioPlayerProps = {
  sourceUrl: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function OracleAudioPlayer({ sourceUrl, style, accessibilityLabel = 'Lire le message vocal' }: OracleAudioPlayerProps) {
  const [paused, setPaused] = useState(true);
  const cleanSourceUrl = useMemo(() => sourceUrl.trim(), [sourceUrl]);

  useEffect(() => {
    setPaused(true);
  }, [cleanSourceUrl]);

  const handlePlaybackStateChange = useCallback((event: OracleAudioPlaybackEvent) => {
    const state = event.nativeEvent.state;
    if (state === 'playing') {
      setPaused(false);
      return;
    }
    if (state === 'paused' || state === 'completed' || state === 'error') {
      setPaused(true);
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (!cleanSourceUrl) return;
    setPaused(current => !current);
  }, [cleanSourceUrl]);

  return (
    <View style={[styles.audioPlayerFrame, style]}>
      <NativeOracleAudioPlayer
        sourceUrl={cleanSourceUrl}
        paused={paused}
        onPlaybackStateChange={handlePlaybackStateChange}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? accessibilityLabel : 'Mettre le vocal en pause'}
        disabled={!cleanSourceUrl}
        onPress={togglePlayback}
        style={styles.audioPlayButtonOverlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  audioPlayerFrame: {
    position: 'relative',
    overflow: 'hidden',
  },
  audioPlayButtonOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 58,
    zIndex: 10,
  },
});
