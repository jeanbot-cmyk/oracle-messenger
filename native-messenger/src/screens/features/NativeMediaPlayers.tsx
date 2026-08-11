import { requireNativeComponent, type ViewStyle } from 'react-native';

export const OracleVideoPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  style?: ViewStyle;
}>('OracleVideoPlayer');

export const OracleAudioPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  style?: ViewStyle;
}>('OracleAudioPlayer');
