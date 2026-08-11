import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
      setError(raw.includes('autre compte Google') || raw.includes('409') || raw.includes('déjà lié') || raw.includes('déjà associé') || raw.includes('deja associe')
        ? 'Ce numéro est déjà lié à un autre compte Google. Connectez-vous avec le Gmail associé à ce numéro.'
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
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
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
                style={styles.phoneInput}
              />
            </View>
          </View>

          <Pressable
            onPress={saveOnboarding}
            disabled={submitDisabled}
            style={[styles.onboardingSubmit, !formIsReady && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.onboardingSubmitText, !formIsReady && styles.disabledSubmitText]}>Commencer à discuter →</Text>}
          </Pressable>
        </View>
      </ScrollView>

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
  onboardingContent: { flexGrow: 1, backgroundColor: colors.surface, paddingBottom: 28 },
  onboardingHeader: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 54, alignItems: 'center' },
  onboardingEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  onboardingTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 5 },
  onboardingSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  onboardingAvatarWrap: { width: 104, height: 104, borderRadius: 52, alignSelf: 'center', marginTop: -46 },
  onboardingAvatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.border, borderWidth: 4, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 5 },
  avatarImage: { width: '100%', height: '100%' },
  onboardingAvatarText: { color: colors.muted, fontSize: 40, fontWeight: '900' },
  onboardingCameraBadge: { position: 'absolute', right: 3, bottom: 3, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  onboardingHint: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  onboardingError: { marginHorizontal: 20, marginTop: 14, padding: 11, borderRadius: 12, backgroundColor: '#FEF2F2', color: colors.danger, borderWidth: 1, borderColor: '#FECACA', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  onboardingForm: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 12 },
  fieldBlock: { backgroundColor: colors.input, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { color: colors.brand, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  optionalLabel: { color: colors.muted, fontWeight: '400', textTransform: 'none' },
  fieldCounter: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  onboardingInput: { minHeight: 24, padding: 0, color: colors.text, fontSize: 16, fontWeight: '500' },
  onboardingTextarea: { minHeight: 54, textAlignVertical: 'top', lineHeight: 22, fontSize: 15 },
  phoneBlock: { gap: 8 },
  phoneLabel: { color: colors.brand, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  countryButton: { minWidth: 112, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  countryFlag: { color: colors.text, fontSize: 20, fontWeight: '900' },
  countryDial: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  countryChevron: { color: colors.muted, fontSize: 16, fontWeight: '900', marginTop: -3 },
  phoneInput: { flex: 1, minWidth: 0, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 15, fontWeight: '500' },
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
  onboardingSubmit: { marginTop: 10, minHeight: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.16, shadowRadius: 12, elevation: 4 },
  disabledButton: { backgroundColor: colors.border, shadowOpacity: 0, elevation: 0 },
  onboardingSubmitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabledSubmitText: { color: colors.muted },
});
