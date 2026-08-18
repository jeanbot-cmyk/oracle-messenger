import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { AuthSession } from '@/types/messenger';
import { COUNTRIES, initials, normalizeOnboardingPhone, type Country } from './homeUtils';

const PROFILE_VERIFICATION_MIN_MS = 1800;

type NativeOnboardingProps = {
  session: AuthSession;
  onComplete: (session: AuthSession) => Promise<void>;
  onLogout: () => Promise<void>;
};

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function NativeOnboarding({ session, onComplete }: NativeOnboardingProps) {
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [country, setCountry] = useState<Country>(COUNTRIES.find(item => item.code === 'CI') || COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredCountries = useMemo(() => {
    const needle = countrySearch.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(item => (
      item.name.toLowerCase().includes(needle) ||
      item.dial.includes(needle) ||
      item.code.toLowerCase().includes(needle)
    ));
  }, [countrySearch]);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission galerie requise pour ajouter une photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (asset.base64) {
      setAvatar(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    } else {
      setAvatar(asset.uri);
    }
    setError('');
  }, []);

  const saveOnboarding = useCallback(async () => {
    const cleanName = name.trim();
    const cleanPhone = normalizeOnboardingPhone(country, phone);
    if (!cleanName) {
      setError('Le nom est requis');
      return;
    }
    if (phone.replace(/\D/g, '').length < 6) {
      setError('Ajoutez le numéro actif utilisé sur ce téléphone.');
      return;
    }

    setSaving(true);
    setError('');
    const startedAt = Date.now();
    try {
      const saved: any = await api.updateMe(session.token, {
        name: cleanName,
        bio: bio.trim(),
        avatar: avatar || undefined,
        phone: cleanPhone,
      });
      const nextSession: AuthSession = {
        token: saved?.token || session.token,
        user: {
          ...session.user,
          ...saved,
          name: saved?.name || cleanName,
          bio: saved?.bio ?? bio.trim(),
          avatar: saved?.avatar ?? avatar,
          phone: saved?.phone || cleanPhone,
          isNew: false,
        },
      };
      delete (nextSession.user as any).token;
      const remaining = PROFILE_VERIFICATION_MIN_MS - (Date.now() - startedAt);
      if (remaining > 0) await wait(remaining);
      await onComplete(nextSession);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err || '');
      setError(raw.includes('autre compte Google') || raw.includes('409') || raw.includes('déjà lié') || raw.includes('déjà associé') || raw.includes('deja associe') || raw.includes('déjà utilisé') || raw.includes('deja utilise')
        ? 'Ce numéro est déjà utilisé par un autre compte Oracle Messenger.'
        : raw.includes('votre compte Oracle Messenger') || raw.includes('même compte Google')
          ? 'Ce numéro appartient déjà à votre compte. Déconnectez-vous puis reconnectez-vous avec le même compte Google pour l’ouvrir.'
          : raw || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }, [avatar, bio, country, name, onComplete, phone, session]);

  const phoneIsInvalid = phone.replace(/\D/g, '').length < 6;
  const formIsReady = Boolean(name.trim()) && !phoneIsInvalid;
  const submitDisabled = saving || !formIsReady;

  return (
    <SafeAreaView style={styles.onboardingSafe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoider}
      >
      <ScrollView
        contentContainerStyle={styles.onboardingContent}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.onboardingHeader}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>OM</Text>
          </View>
          <Text style={styles.onboardingEyebrow}>Oracle Messenger</Text>
          <Text style={styles.onboardingTitle}>Votre profil de confiance</Text>
          <Text style={styles.onboardingSubtitle}>Ajoutez votre photo, votre nom et le numéro actif de ce téléphone.</Text>
        </View>

        <Pressable onPress={pickAvatar} style={styles.onboardingAvatarWrap}>
          <View style={styles.onboardingAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.onboardingAvatarText}>{initials(name)}</Text>}
          </View>
          <View style={styles.onboardingCameraBadge}>
            <Camera size={16} color="#FFFFFF" />
          </View>
        </Pressable>
        <Text style={styles.onboardingHint}>Appuyez pour ajouter une photo</Text>

        {error ? <Text style={styles.onboardingError}>{error}</Text> : null}

        <View style={styles.onboardingForm}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Votre nom *</Text>
            <TextInput
              value={name}
              onChangeText={text => { setName(text); setError(''); }}
              placeholder="Ex : Jean Dupont"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxLength={50}
              style={styles.onboardingInput}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bio <Text style={styles.optionalLabel}>(optionnel)</Text></Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Dites quelque chose sur vous…"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxLength={160}
              multiline
              style={[styles.onboardingInput, styles.onboardingTextarea]}
            />
            <Text style={styles.fieldCounter}>{bio.length}/160</Text>
          </View>

          <View style={styles.phoneBlock}>
            <Text style={styles.phoneLabel}>Numéro de téléphone *</Text>
            <Text style={styles.phoneHelp}>
              Renseignez le bon numéro actif dans ce téléphone. Un contrôle automatique sera fait à la validation.
            </Text>
            <View style={styles.phoneImportantBox}>
              <Text style={styles.phoneImportantTitle}>Important</Text>
              <Text style={styles.phoneImportantText}>
                Le bon numéro est capital : c’est avec lui que vous retrouverez vos amis et que vos contacts pourront vous joindre.
              </Text>
            </View>
            <View style={styles.phoneRow}>
              <Pressable style={styles.countryButton} onPress={() => setShowCountries(current => !current)}>
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <Text style={styles.countryChevron}>⌄</Text>
              </Pressable>
              <TextInput
                value={phone}
                onChangeText={text => { setPhone(text.replace(/[^\d]/g, '')); setError(''); }}
                placeholder="Ex: 0102030405"
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                keyboardType="phone-pad"
                style={styles.phoneInput}
              />
            </View>
          </View>

          <Pressable
            onPress={saveOnboarding}
            disabled={submitDisabled}
            style={[styles.onboardingSubmit, !formIsReady && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.onboardingSubmitText, !formIsReady && styles.disabledSubmitText]}>Valider et vérifier</Text>}
          </Pressable>
          <Text style={styles.submitHelp}>Après validation, Oracle Messenger vérifie le profil quelques secondes avant d’ouvrir l’application.</Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {saving ? (
        <View style={styles.verificationOverlay} pointerEvents="auto">
          <View style={styles.verificationCard}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.verificationTitle}>Vérification du numéro</Text>
            <Text style={styles.verificationText}>Contrôle automatique en cours avant l’ouverture de votre compte.</Text>
          </View>
        </View>
      ) : null}

      <Modal visible={showCountries} transparent animationType="slide" onRequestClose={() => setShowCountries(false)}>
        <Pressable style={styles.countryModalBackdrop} onPress={() => { setShowCountries(false); setCountrySearch(''); }}>
          <Pressable style={styles.countrySheet} onPress={event => event.stopPropagation()}>
            <View style={styles.countrySheetSearchRow}>
              <TextInput
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholder="Rechercher un pays ou code…"
                placeholderTextColor={colors.muted}
                style={styles.countrySearch}
                autoFocus
              />
              <Pressable onPress={() => { setShowCountries(false); setCountrySearch(''); }} style={styles.countryCloseButton}>
                <Text style={styles.countryCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.countryOptionsList} keyboardShouldPersistTaps="handled">
              {filteredCountries.map(item => (
                <Pressable
                  key={`${item.code}-${item.dial}`}
                  style={[styles.countryOption, item.code === country.code && styles.countryOptionActive]}
                  onPress={() => { setCountry(item); setShowCountries(false); setCountrySearch(''); }}
                >
                  <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                  <Text style={styles.countryOptionName}>{item.name}</Text>
                  <Text style={styles.countryOptionDial}>{item.dial}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  onboardingSafe: { flex: 1, backgroundColor: colors.surface },
  keyboardAvoider: { flex: 1 },
  onboardingContent: { flexGrow: 1, backgroundColor: colors.surface, paddingBottom: 142 },
  onboardingHeader: { backgroundColor: colors.header, paddingHorizontal: 24, paddingTop: 30, paddingBottom: 72, alignItems: 'center' },
  brandMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.20)' },
  brandMarkText: { color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  onboardingEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0, marginTop: 14 },
  onboardingTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  onboardingSubtitle: { color: 'rgba(255,255,255,0.84)', fontSize: 15, lineHeight: 21, fontWeight: '700', marginTop: 9, textAlign: 'center', maxWidth: 310 },
  onboardingAvatarWrap: { width: 124, height: 124, borderRadius: 30, alignSelf: 'center', marginTop: -58 },
  onboardingAvatar: { width: 124, height: 124, borderRadius: 30, backgroundColor: '#EAF4F1', borderWidth: 5, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: colors.header, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  avatarImage: { width: '100%', height: '100%' },
  onboardingAvatarText: { color: colors.header, fontSize: 54, fontWeight: '900' },
  onboardingCameraBadge: { position: 'absolute', right: 4, bottom: 4, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.surface },
  onboardingHint: { color: colors.secondary, fontSize: 14, lineHeight: 18, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  onboardingError: { marginHorizontal: 20, marginTop: 24, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: '#FEF2F2', color: '#DC2626', borderWidth: 1, borderColor: '#FECACA', fontSize: 14, fontWeight: '700', lineHeight: 21 },
  onboardingForm: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30, gap: 14 },
  fieldBlock: { backgroundColor: colors.input, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 16 },
  fieldLabel: { color: colors.header, fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0, marginBottom: 10 },
  optionalLabel: { color: colors.muted, fontWeight: '500', textTransform: 'none' },
  fieldCounter: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  onboardingInput: { minHeight: 32, padding: 0, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  onboardingTextarea: { minHeight: 92, textAlignVertical: 'top', lineHeight: 23, fontSize: 16 },
  phoneBlock: { gap: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 16, paddingVertical: 16 },
  phoneLabel: { color: colors.header, fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0 },
  phoneHelp: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  phoneImportantBox: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,168,132,0.26)', backgroundColor: colors.accentSoft, paddingHorizontal: 13, paddingVertical: 11, gap: 3 },
  phoneImportantTitle: { color: colors.title, fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0 },
  phoneImportantText: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch', marginTop: 2 },
  countryButton: { minWidth: 122, minHeight: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  countryFlag: { color: colors.text, fontSize: 24, fontWeight: '900' },
  countryDial: { color: colors.header, fontSize: 18, fontWeight: '900' },
  countryChevron: { color: colors.muted, fontSize: 16, fontWeight: '900', marginTop: -3 },
  phoneInput: { flex: 1, minWidth: 0, minHeight: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 18, fontWeight: '700' },
  countryModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.50)', justifyContent: 'flex-end' },
  countrySheet: { width: '100%', maxHeight: '80%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  countrySheetSearchRow: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  countrySearch: { flex: 1, minHeight: 42, borderRadius: 20, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontSize: 14, fontWeight: '500' },
  countryCloseButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  countryCloseText: { color: colors.muted, fontSize: 22, fontWeight: '500' },
  countryOptionsList: { flexGrow: 0 },
  countryOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  countryOptionActive: { backgroundColor: '#F0FDF4' },
  countryOptionFlag: { width: 30, color: colors.text, fontSize: 22, fontWeight: '900' },
  countryOptionName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
  countryOptionDial: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  onboardingSubmit: { marginTop: 8, minHeight: 62, borderRadius: 22, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', shadowColor: colors.header, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  disabledButton: { backgroundColor: colors.border, shadowOpacity: 0, elevation: 0 },
  onboardingSubmitText: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '900' },
  disabledSubmitText: { color: colors.muted },
  submitHelp: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  verificationOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,28,26,0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  verificationCard: { width: '100%', maxWidth: 320, borderRadius: 22, backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 26, alignItems: 'center', gap: 12, shadowColor: colors.header, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
  verificationTitle: { color: colors.header, fontSize: 18, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  verificationText: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
});
