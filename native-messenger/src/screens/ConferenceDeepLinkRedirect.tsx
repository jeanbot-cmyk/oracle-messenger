import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { rememberPendingConference } from '@/services/pendingConference';
import { colors } from '@/theme/colors';

type RouteParam = string | string[] | undefined;

function firstParam(value: RouteParam) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanConferenceSlug(value: unknown) {
  const raw = String(value || '').split(/[?#]/)[0]?.trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

function conferenceSlugFromUrl(url: string | null | undefined) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'oraclemessenger:') {
      if (parsed.hostname.toLowerCase() === 'conference') {
        return cleanConferenceSlug(parsed.pathname.replace(/^\/+/, '') || parsed.searchParams.get('slug'));
      }
      const match = parsed.pathname.match(/^\/conference\/([^/?#]+)/i);
      return cleanConferenceSlug(match?.[1]);
    }
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      const match = parsed.pathname.match(/^\/conference\/([^/?#]+)/i);
      return cleanConferenceSlug(match?.[1]);
    }
  } catch {
    const match = raw.match(/(?:^|\/)conference\/([^/?#]+)/i);
    return cleanConferenceSlug(match?.[1]);
  }
  return '';
}

function conferenceSlugFromPath(pathname: string) {
  const match = String(pathname || '').match(/^\/conference\/([^/?#]+)/i);
  return cleanConferenceSlug(match?.[1]);
}

export function ConferenceDeepLinkRedirect({ slug, fallbackOnUnknown = false }: { slug?: RouteParam; fallbackOnUnknown?: boolean }) {
  const params = useGlobalSearchParams<{ conference?: RouteParam; slug?: RouteParam }>();
  const pathname = usePathname();
  const [unknownRoute, setUnknownRoute] = useState(false);
  const routeSlug = useMemo(
    () => cleanConferenceSlug(firstParam(slug) || firstParam(params.conference) || firstParam(params.slug)) || conferenceSlugFromPath(pathname),
    [params.conference, params.slug, pathname, slug],
  );

  useEffect(() => {
    let alive = true;
    const redirect = async () => {
      const initialUrl = await Linking.getInitialURL().catch(() => null);
      const nextSlug = routeSlug || conferenceSlugFromUrl(initialUrl);
      if (!nextSlug && fallbackOnUnknown) {
        if (alive) setUnknownRoute(true);
        return;
      }
      if (nextSlug) await rememberPendingConference(nextSlug);
      if (!alive) return;
      const query = nextSlug
        ? `?open=conference&conference=${encodeURIComponent(nextSlug)}`
        : '?open=conference';
      router.replace(`/${query}`);
    };
    void redirect();
    return () => {
      alive = false;
    };
  }, [fallbackOnUnknown, routeSlug]);

  if (unknownRoute) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Page introuvable</Text>
        <Text style={styles.subtitle}>Ce lien ne correspond pas à une salle de conférence Oracle Messenger.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.button}>
          <Text style={styles.buttonText}>Retour à Oracle Messenger</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.header} />
      <Text style={styles.title}>Ouverture de la salle de conférence...</Text>
      <Text style={styles.subtitle}>Redirection vers Oracle Messenger.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.header,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
});
