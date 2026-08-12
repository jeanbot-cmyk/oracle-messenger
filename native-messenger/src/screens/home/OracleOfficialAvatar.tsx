import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

const ORACLE_SYSTEM_AVATAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="88" y1="42" x2="424" y2="470" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#13A085"/>
      <stop offset="0.48" stop-color="#0B6F61"/>
      <stop offset="1" stop-color="#063F39"/>
    </linearGradient>
    <linearGradient id="gold" x1="139" y1="86" x2="373" y2="426" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF1B8"/>
      <stop offset="0.48" stop-color="#D9B34F"/>
      <stop offset="1" stop-color="#966815"/>
    </linearGradient>
    <linearGradient id="bubble" x1="134" y1="151" x2="385" y2="360" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E8F7F2"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path fill="#FFFFFF" fill-opacity="0.12" d="M96 78c57-43 143-54 221-28 76 25 136 83 156 151 20 69 1 147-51 204-54 59-141 93-224 73-84-20-163-93-176-178C9 215 39 121 96 78Z"/>
  <circle cx="256" cy="256" r="190" fill="none" stroke="url(#gold)" stroke-width="18"/>
  <circle cx="256" cy="256" r="162" fill="#FFFFFF" fill-opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/>
  <path fill="#FFFFFF" d="M154 151h202c33.7 0 61 27.3 61 61v70c0 33.7-27.3 61-61 61h-78.3l-103.6 59.6c-9.3 5.4-19.8-4.7-14.9-14.3l23.1-45.3H154c-33.7 0-61-27.3-61-61v-70c0-33.7 27.3-61 61-61Z"/>
  <path fill="url(#bubble)" d="M162 175h188c21 0 38 17 38 38v60c0 21-17 38-38 38h-88.6l-63.5 36.5 18.7-36.5H162c-21 0-38-17-38-38v-60c0-21 17-38 38-38Z"/>
  <circle cx="210" cy="246" r="17" fill="#075E54"/>
  <circle cx="256" cy="246" r="17" fill="#075E54"/>
  <circle cx="302" cy="246" r="17" fill="#075E54"/>
  <path fill="url(#gold)" d="M200 366h112c7.2 0 13 5.8 13 13s-5.8 13-13 13H200c-7.2 0-13-5.8-13-13s5.8-13 13-13Z"/>
</svg>`;

type OracleOfficialAvatarProps = {
  size?: number;
};

export function OracleOfficialAvatar({ size = 50 }: OracleOfficialAvatarProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <SvgXml xml={ORACLE_SYSTEM_AVATAR_SVG} width={size} height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#075E54' },
});
