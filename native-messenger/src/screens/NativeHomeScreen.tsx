import { NativeHomeShell } from '@/screens/home/NativeHomeShell';
import { NativeLoginScreen } from '@/screens/home/NativeLoginScreen';
import { NativeLoadingScreen } from '@/screens/home/NativeLoadingScreen';
import { NativeOnboarding } from '@/screens/home/NativeOnboarding';
import { useNativeHomeController } from '@/screens/home/useNativeHomeController';

export function NativeHomeScreen() {
  const home = useNativeHomeController();

  if (home.loading) {
    return <NativeLoadingScreen />;
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

  return home.shellProps ? <NativeHomeShell {...home.shellProps} /> : null;
}
