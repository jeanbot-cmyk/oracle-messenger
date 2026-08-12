import { requireNativeComponent, type StyleProp, type ViewStyle } from 'react-native';

export const OracleVideoPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  style?: StyleProp<ViewStyle>;
}>('OracleVideoPlayer');

export const OracleAudioPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}>('OracleAudioPlayer');
