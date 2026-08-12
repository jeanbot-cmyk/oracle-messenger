import { Share } from 'react-native';
import { FRONTEND_URL } from '@/config/env';

export const ORACLE_APP_SHARE_URL = FRONTEND_URL;
export const ORACLE_APP_SHARE_MESSAGE = `Inviter des contacts ${ORACLE_APP_SHARE_URL}`;

export async function shareOracleMessengerApp() {
  return Share.share({
    title: 'Oracle Messenger',
    message: ORACLE_APP_SHARE_MESSAGE,
    url: ORACLE_APP_SHARE_URL,
  });
}
