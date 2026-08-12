import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { AuthSession } from '@/types/messenger';
import { COUNTRIES, initials, normalizeOnboardingPhone, type Country } from './homeUtils';

type NativeOnboardingProps = {
  session: AuthSession;
  onComplete: (session: AuthSession) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function NativeOnboarding({ session, onComplete }: NativeOnboardingProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [country, setCountry] = useState<Country>(COUNTRIES.find(item => item.code === 'CI') || COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
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
      setError('Le numéro de téléphone est requis');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved: any = await api.updateMe(session.token, {
        name: cleanName,
        bio: bio.trim(),
        avatar: avatar || undefined,
        phone: cleanPhone,
      });
      setSaving(false);
      setVerifyingPhone(true);
      await new Promise(resolve => setTimeout(resolve, 4000));
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
      setVerifyingPhone(false);
    }
  }, [avatar, bio, country, name, onComplete, phone, session]);

  const phoneIsInvalid = phone.replace(/\D/g, '').length < 6;
  const formIsReady = Boolean(name.trim()) && !phoneIsInvalid;
  const submitDisabled = saving || verifyingPhone || !formIsReady;

  return (
    <SafeAreaView style={styles.onboardingSafe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoider}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.onboardingContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.onboardingHeader}>
          <Text style={styles.onboardingEyebrow}>Bienvenue sur</Text>
          <Text style={styles.onboardingTitle}>Oracle Messenger</Text>
          <Text style={styles.onboardingSubtitle}>Complétez votre profil pour commencer</Text>
        </View>

        <Pressable onPress={pickAvatar} style={styles.onboardingAvatarWrap}>
          <View style={styles.onboardingAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.onboardingAvatarText}>{initials(name)}</Text>}
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
              maxLength={160}
              multiline
              style={[styles.onboardingInput, styles.onboardingTextarea]}
            />
            <Text style={styles.fieldCounter}>{bio.length}/160</Text>
          </View>

          <View style={styles.phoneBlock}>
            <Text style={styles.phoneLabel}>Numéro de téléphone *</Text>
            <Text style={styles.phoneHelp}>
              Mettez un numéro actif dans ce téléphone. Une vérification automatique sera effectuée pour confirmer ce numéro après validation.
            </Text>
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
                keyboardType="phone-pad"
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
                style={styles.phoneInput}
              />
            </View>
          </View>

          {verifyingPhone ? (
            <View style={styles.verificationBox}>
              <ActivityIndicator color={colors.brand} />
              <View style={styles.verificationTextWrap}>
                <Text style={styles.verificationTitle}>Vérification automatique du numéro...</Text>
                <Text style={styles.verificationText}>Confirmation en cours. L’application s’ouvrira automatiquement.</Text>
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={saveOnboarding}
            disabled={submitDisabled}
            style={[styles.onboardingSubmit, !formIsReady && styles.disabledButton]}
          >
            {saving || verifyingPhone ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.onboardingSubmitText, !formIsReady && styles.disabledSubmitText]}>Commencer à discuter →</Text>}
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

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
  onboardingContent: { flexGrow: 1, backgroundColor: colors.surface, paddingBottom: 180 },
  onboardingHeader: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingTop: 58, paddingBottom: 104, alignItems: 'center' },
  onboardingEyebrow: { color: 'rgba(255,255,255,0.70)', fontSize: 15, lineHeight: 19, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2 },
  onboardingTitle: { color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '900', marginTop: 20 },
  onboardingSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 20, lineHeight: 26, fontWeight: '500', marginTop: 16, textAlign: 'center' },
  onboardingAvatarWrap: { width: 132, height: 132, borderRadius: 66, alignSelf: 'center', marginTop: -66 },
  onboardingAvatar: { width: 132, height: 132, borderRadius: 66, backgroundColor: '#E5E7EB', borderWidth: 5, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  avatarImage: { width: '100%', height: '100%' },
  onboardingAvatarText: { color: '#64748B', fontSize: 58, fontWeight: '900' },
  onboardingCameraBadge: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.surface },
  onboardingHint: { color: colors.muted, fontSize: 17, fontWeight: '500', textAlign: 'center', marginTop: 18 },
  onboardingError: { marginHorizontal: 24, marginTop: 28, paddingHorizontal: 18, paddingVertical: 16, borderRadius: 18, backgroundColor: '#FEF2F2', color: '#DC2626', borderWidth: 1, borderColor: '#FECACA', fontSize: 17, fontWeight: '500', lineHeight: 26 },
  onboardingForm: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 34, gap: 16 },
  fieldBlock: { backgroundColor: colors.input, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 18 },
  fieldLabel: { color: colors.brand, fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  optionalLabel: { color: colors.muted, fontWeight: '500', textTransform: 'none' },
  fieldCounter: { color: colors.muted, fontSize: 14, fontWeight: '700', textAlign: 'right', marginTop: 8 },
  onboardingInput: { minHeight: 34, padding: 0, color: colors.text, fontSize: 22, fontWeight: '400' },
  onboardingTextarea: { minHeight: 112, textAlignVertical: 'top', lineHeight: 29, fontSize: 20 },
  phoneBlock: { gap: 10, paddingTop: 2 },
  phoneLabel: { color: colors.brand, fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  phoneHelp: { color: colors.secondary, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  countryButton: { minWidth: 136, minHeight: 70, borderRadius: 18, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  countryFlag: { color: colors.text, fontSize: 26, fontWeight: '900' },
  countryDial: { color: colors.brand, fontSize: 21, fontWeight: '900' },
  countryChevron: { color: colors.muted, fontSize: 16, fontWeight: '900', marginTop: -3 },
  phoneInput: { flex: 1, minWidth: 0, minHeight: 70, borderRadius: 18, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 12, color: colors.text, fontSize: 20, fontWeight: '500' },
  verificationBox: { minHeight: 74, borderRadius: 20, borderWidth: 1, borderColor: '#BFE9DA', backgroundColor: '#EAF4F1', paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  verificationTextWrap: { flex: 1, minWidth: 0 },
  verificationTitle: { color: colors.brand, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  verificationText: { color: colors.secondary, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 3 },
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
  onboardingSubmit: { marginTop: 10, minHeight: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  disabledButton: { backgroundColor: colors.border, shadowOpacity: 0, elevation: 0 },
  onboardingSubmitText: { color: '#FFFFFF', fontSize: 21, lineHeight: 26, fontWeight: '900' },
  disabledSubmitText: { color: colors.muted },
});
