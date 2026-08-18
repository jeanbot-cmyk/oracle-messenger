import { useLocalSearchParams } from 'expo-router';
import { ConferenceDeepLinkRedirect } from '@/screens/ConferenceDeepLinkRedirect';

export default function ConferenceSlugRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  return <ConferenceDeepLinkRedirect slug={slug} />;
}
