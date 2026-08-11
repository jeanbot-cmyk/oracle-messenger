import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Bot, BriefcaseBusiness, Contact, CreditCard, FileText, Globe, Image, Languages, LogOut, Shield, Settings, Share2, Sparkles, User, Wand2 } from 'lucide-react-native';
import { FRONTEND_URL } from '@/config/env';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { colors } from '@/theme/colors';
import { PageHeader, SecondaryButton, Section } from './FeatureUi';

type MenuItem = {
  icon: typeof User;
  label: string;
  sub: string;
  tab?: NativeTabKey;
  action?: () => void | Promise<void>;
};

function ServiceRow({ item, onOpenTab }: { item: MenuItem; onOpenTab: (tab: NativeTabKey) => void }) {
  const Icon = item.icon;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Icon size={22} color={colors.accent} strokeWidth={1.8} /></View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{item.label}</Text>
        <Text style={styles.rowSub}>{item.sub}</Text>
      </View>
      <SecondaryButton label="Ouvrir" onPress={() => item.tab ? onOpenTab(item.tab) : item.action?.()} />
    </View>
  );
}

export function MenuPage({ isAdmin, onOpenTab, onLogout }: { isAdmin: boolean; onOpenTab: (tab: NativeTabKey) => void; onLogout: () => void | Promise<void> }) {
  const openOracleWeb = () => {
    Linking.openURL('https://web.oracle-plus.online?source=messenger-native-menu').catch(() => undefined);
  };
  const openSpirituality = () => {
    Linking.openURL('https://oracle-plus.online/consultation').catch(() => undefined);
  };
  const openPrivacy = () => {
    Linking.openURL(`${FRONTEND_URL}/privacy`).catch(() => undefined);
  };
  const openTerms = () => {
    Linking.openURL(`${FRONTEND_URL}/terms`).catch(() => undefined);
  };
  const shareApp = async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: 'Oracle Messenger: https://messenger.oracle-plus.online',
    });
  };

  const account: MenuItem[] = [
    { icon: User, label: 'Profil', sub: 'Profil, photo, nom et préférences personnelles.', tab: 'profile' },
    { icon: Contact, label: 'Contacts', sub: 'Retrouver et inviter vos contacts Oracle Messenger.', tab: 'contacts' },
  ];
  const services: MenuItem[] = [
    { icon: BriefcaseBusiness, label: 'Business Assistant', sub: 'Fiches clients, relances, notes et réponses professionnelles.', tab: 'business' },
    { icon: Bot, label: 'Réponses IA', sub: 'Préparer des réponses automatiques avec un prompt contrôlé.', tab: 'ai' },
    { icon: Wand2, label: 'Créer un flyer IA', sub: "Créez des affiches et flyers professionnels avec l'intelligence artificielle.", tab: 'flyers' },
    { icon: Sparkles, label: 'IA Vidéo', sub: 'Créez vos vidéos de présentation IA avec voix off et musique.', tab: 'videos' },
    { icon: CreditCard, label: 'Paiements', sub: 'Paystack et vérification serveur des crédits.', tab: 'payments' },
    { icon: Image, label: 'Galerie', sub: 'Médias locaux téléchargés et validés.', tab: 'gallery' },
    { icon: Languages, label: 'Traduction', sub: 'Rédiger, reformuler ou traduire un message avant envoi.', tab: 'tools' },
    { icon: Globe, label: 'Oracle Web', sub: 'Créer mon site web, appli ou boutique.', action: openOracleWeb },
    { icon: Sparkles, label: 'Spiritualité', sub: 'Accéder aux consultations et services Oracle Plus.', action: openSpirituality },
  ];
  const settings: MenuItem[] = [
    { icon: Settings, label: 'Paramètres', sub: 'Notifications, sécurité et stockage.', tab: 'profile' },
    { icon: Shield, label: 'Confidentialité', sub: 'Politique de confidentialité Oracle Messenger.', action: openPrivacy },
    { icon: FileText, label: 'Conditions', sub: "Règles d'utilisation et services Oracle Messenger.", action: openTerms },
    ...(isAdmin ? [{ icon: Shield, label: 'Administration', sub: 'Statistiques, notifications et message système.', tab: 'admin' as NativeTabKey }] : []),
    { icon: Share2, label: 'Partager', sub: 'Partager Oracle Messenger.', action: shareApp },
    { icon: LogOut, label: 'Déconnexion', sub: 'Fermer la session sur ce téléphone.', action: onLogout },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader title="Menu" subtitle="Compte, services et réglages principaux." />
      <Section title="Compte">
        {account.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </Section>
      <Section title="Services">
        {services.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </Section>
      <Section title="Réglages">
        {settings.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 0, paddingBottom: 86, backgroundColor: colors.background },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  rowSub: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
