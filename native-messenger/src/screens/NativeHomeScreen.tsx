import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NativeHomeShell } from '@/screens/home/NativeHomeShell';
import { NativeLoginScreen } from '@/screens/home/NativeLoginScreen';
import { NativeOnboarding } from '@/screens/home/NativeOnboarding';
import { useNativeHomeController } from '@/screens/home/useNativeHomeController';
import { colors } from '@/theme/colors';

function NativeLoadingState({ text = 'Chargement Oracle Messenger...' }: { text?: string }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingMark}>
        <Text style={styles.loadingInitials}>OM</Text>
      </View>
      <ActivityIndicator color={colors.header} />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

export function NativeHomeScreen() {
  const home = useNativeHomeController();

  if (home.loading && !home.session) {
    return <NativeLoadingState />;
  }

  if (!home.session) {
    return <NativeLoginScreen notice={home.notice} busy={home.busy} onSignIn={home.signInWithGoogle} />;
  }

  if (home.needsOnboarding) {
    return (
      <NativeOnboarding
        session={home.session}
        onComplete={home.completeOnboarding}
        onLogout={home.logout}
      />
    );
  }

  return home.shellProps ? <NativeHomeShell {...home.shellProps} /> : <NativeLoadingState text="Préparation de l’interface..." />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: colors.background,
  },
  loadingMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.header,
  },
  loadingInitials: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  loadingText: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
});
