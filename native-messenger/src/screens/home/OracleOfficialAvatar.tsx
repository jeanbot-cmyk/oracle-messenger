import { Image, StyleSheet, View } from 'react-native';

export const ORACLE_APP_ICON = require('../../../assets/icon.png');

type OracleOfficialAvatarProps = {
  size?: number;
};

export function OracleOfficialAvatar({ size = 50 }: OracleOfficialAvatarProps) {
  const radius = Math.max(12, Math.round(size * 0.24));
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}>
      <Image source={ORACLE_APP_ICON} resizeMode="cover" style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#075E54',
  },
  logo: { width: '100%', height: '100%' },
});
