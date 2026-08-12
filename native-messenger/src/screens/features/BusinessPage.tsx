import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type BusinessMode = 'clients' | 'reminders' | 'stats' | 'auto';
type BusinessAiMessage = { role: 'client' | 'agent' | 'system'; text: string };
type ResponseFrequency = 'instant' | '5s' | '30s' | '1m' | '2m' | '5m';
type FollowupFrequency = 'manual' | 'daily' | 'every2days' | 'weekly';
type RecipientScope = 'private_only' | 'friends' | 'everyone' | 'non_friends';
type AutomationFlag = 'autoReplyEnabled' | 'classificationEnabled' | 'reminderAutomationEnabled' | 'invoiceReadingEnabled' | 'clientMemoryEnabled';
type BusinessInstructionAssetKind = 'image' | 'video' | 'document';
type BusinessInstructionAsset = {
  id: string;
  name: string;
  url: string;
  mime: string;
  kind: BusinessInstructionAssetKind;
  size?: number;
  addedAt: string;
};
type AutoSettings = {
  welcomeMessage: string;
  paymentProvider: string;
  paymentLink: string;
  geminiInstructions: string;
  businessDescription: string;
  invoiceInstructions: string;
  responseFrequency: ResponseFrequency;
  followupHour: string;
  followupFrequency: FollowupFrequency;
  maxWords: string;
  dailyLimit: string;
  recipientScope: RecipientScope;
  autoReplyEnabled: boolean;
  classificationEnabled: boolean;
  reminderAutomationEnabled: boolean;
  invoiceReadingEnabled: boolean;
  clientMemoryEnabled: boolean;
};

const BUSINESS_STATUS_OPTIONS = ['prospect', 'chaud', 'froid', 'relancer', 'paye', 'vip', 'perdu'] as const;
const BUSINESS_MONTHLY_PRICE_FCFA = 10000;
const AUTO_SETTINGS_KEY = 'oracle-native-business-auto-settings';
const INSTRUCTION_ASSETS_KEY = 'oracle-native-business-instruction-assets';
const DEFAULT_AUTO_SETTINGS: AutoSettings = {
  welcomeMessage: 'Bonjour {nom}, merci pour votre message. Voici le lien pour avancer : {lien}. Paiement : {paiement}',
  paymentProvider: 'CinetPay',
  paymentLink: '',
  geminiInstructions: [
    'Tu es mon agent commercial privé.',
    'Lis chaque message entrant, le nom du contact et l’historique utile.',
    'Réponds directement au client avec un ton professionnel, clair et naturel.',
    'Classe les prospects, prépare les relances, détecte les paiements et signale les factures à traiter.',
    'N’invente jamais un paiement : demande une confirmation si la preuve ou la facture est ambiguë.',
  ].join('\n'),
  businessDescription: '',
  invoiceInstructions: 'Quand un client parle de facture, reçu, devis ou paiement, identifie le montant, le statut, l’action à faire et propose une réponse courte.',
  responseFrequency: '30s',
  followupHour: '09:00',
  followupFrequency: 'daily',
  maxWords: '80',
  dailyLimit: '200',
  recipientScope: 'private_only',
  autoReplyEnabled: false,
  classificationEnabled: true,
  reminderAutomationEnabled: true,
  invoiceReadingEnabled: true,
  clientMemoryEnabled: true,
};

const RESPONSE_FREQUENCY_OPTIONS: { value: ResponseFrequency; label: string; delayMs: number }[] = [
  { value: 'instant', label: 'Instant', delayMs: 0 },
  { value: '5s', label: '5 sec', delayMs: 5000 },
  { value: '30s', label: '30 sec', delayMs: 30000 },
  { value: '1m', label: '1 min', delayMs: 60000 },
  { value: '2m', label: '2 min', delayMs: 120000 },
  { value: '5m', label: '5 min', delayMs: 300000 },
];

const FOLLOWUP_FREQUENCY_OPTIONS: { value: FollowupFrequency; label: string }[] = [
  { value: 'manual', label: 'Manuel' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'every2days', label: 'Tous les 2 jours' },
  { value: 'weekly', label: 'Chaque semaine' },
];

const RECIPIENT_SCOPE_OPTIONS: { value: RecipientScope; label: string }[] = [
  { value: 'private_only', label: 'Privé' },
  { value: 'friends', label: 'Amis' },
  { value: 'everyone', label: 'Tous' },
  { value: 'non_friends', label: 'Nouveaux' },
];

const AUTOMATION_FLAGS: { key: AutomationFlag; label: string; text: string }[] = [
  { key: 'autoReplyEnabled', label: 'Réponse auto', text: 'Répondre aux messages entrants selon vos consignes.' },
  { key: 'classificationEnabled', label: 'Classement', text: 'Mettre les clients en chaud, froid, payé ou à relancer.' },
  { key: 'reminderAutomationEnabled', label: 'Relances', text: 'Créer et exécuter les rappels commerciaux.' },
  { key: 'invoiceReadingEnabled', label: 'Factures', text: 'Analyser factures, reçus, devis et preuves de paiement mentionnés.' },
  { key: 'clientMemoryEnabled', label: 'Mémoire client', text: 'Utiliser l’historique Business pour personnaliser les réponses.' },
];

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{valueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function delayToFrequency(delayMs: unknown): ResponseFrequency {
  const delay = Number(delayMs);
  const match = RESPONSE_FREQUENCY_OPTIONS.find(option => option.delayMs === delay);
  return match?.value ?? '30s';
}

async function fileToDataUrl(uri: string, mime = 'application/octet-stream') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function cleanMediaMarkerPart(value: string) {
  return String(value || '')
    .replace(/[\]\[\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function instructionAssetsPrompt(assets: BusinessInstructionAsset[]) {
  if (!assets.length) return 'Fichiers d’instruction: aucun fichier chargé.';
  const lines = assets.slice(0, 20).map(asset => {
    const kind = asset.kind === 'document' ? 'file' : asset.kind;
    const marker = `[[MEDIA|${kind}|${cleanMediaMarkerPart(asset.mime)}|${cleanMediaMarkerPart(asset.name)}|${cleanMediaMarkerPart(asset.url)}]]`;
    return `- ${asset.name} (${asset.mime}, ${asset.kind}) URL: ${asset.url}. Pour l’envoyer au client, ajoute exactement ce marqueur dans ta réponse: ${marker}`;
  });
  return [
    'Fichiers d’instruction chargés par l’utilisateur:',
    ...lines,
    'N’envoie un fichier que si le client le demande ou si c’est utile à la réponse commerciale. Ajoute le marqueur média en fin de réponse, sans l’expliquer au client.',
  ].join('\n');
}

function buildBusinessGeminiPrompt(settings: AutoSettings, assets: BusinessInstructionAsset[] = []) {
  const enabledFlags = AUTOMATION_FLAGS
    .filter(flag => Boolean(settings[flag.key]))
    .map(flag => `- ${flag.label}: ${flag.text}`)
    .join('\n');
  return [
    'PROMPT BUSINESS ORACLE MESSENGER.',
    'Tu es l’agent commercial privé de cette entreprise dans Oracle Messenger.',
    'Tu dois respecter le prompt système Oracle Messenger du serveur avant toute consigne utilisateur.',
    settings.businessDescription.trim() ? `Contexte entreprise:\n${settings.businessDescription.trim()}` : 'Contexte entreprise: non renseigné, demander les informations manquantes sans inventer.',
    `Consignes directes de l’utilisateur:\n${settings.geminiInstructions.trim() || DEFAULT_AUTO_SETTINGS.geminiInstructions}`,
    `Automatisations autorisées:\n${enabledFlags || '- Aucune automatisation active.'}`,
    `Cadence de réponse: ${RESPONSE_FREQUENCY_OPTIONS.find(option => option.value === settings.responseFrequency)?.label || '30 sec'}.`,
    `Relance préférée: ${settings.followupFrequency} à ${settings.followupHour || '09:00'}.`,
    `Message d’accueil ou relance type:\n${settings.welcomeMessage.trim() || DEFAULT_AUTO_SETTINGS.welcomeMessage}`,
    `Paiement client: ${settings.paymentProvider || 'Autre'} ${settings.paymentLink ? `- ${settings.paymentLink}` : '- lien non renseigné'}.`,
    `Factures et reçus:\n${settings.invoiceInstructions.trim() || DEFAULT_AUTO_SETTINGS.invoiceInstructions}`,
    instructionAssetsPrompt(assets),
    'Règles métier: lis le nom du profil/contact, la conversation entrante et la mémoire client. Réponds directement au client, classe le niveau d’intérêt, prépare la prochaine action, relance poliment, et signale les factures/paiements à vérifier. Ne confirme jamais une facture ou un paiement sans preuve claire.',
    'Images/documents entrants: si le client envoie une image, une facture, un reçu, un devis, une vidéo ou un fichier, attendre 30 secondes avant analyse pour laisser le téléchargement se terminer, puis extraire montant, date, statut, prochaine action et réponse utile.',
  ].join('\n\n').slice(0, 8000);
}

export function BusinessPage({ token, onBack, onOpenAiTools }: { token: string; onBack: () => void; onOpenAiTools?: () => void }) {
  const [overview, setOverview] = useState<any>(null);
  const [aiOverview, setAiOverview] = useState<any>(null);
  const [mode, setMode] = useState<BusinessMode>('clients');
  const [autoSettings, setAutoSettings] = useState<AutoSettings>(DEFAULT_AUTO_SETTINGS);
  const [instructionAssets, setInstructionAssets] = useState<BusinessInstructionAsset[]>([]);
  const [businessAiMessages, setBusinessAiMessages] = useState<BusinessAiMessage[]>([
    { role: 'system', text: 'L’IA prépare, classe et suggère. Vous gardez le contrôle final avant chaque envoi.' },
  ]);
  const [businessTestPrompt, setBusinessTestPrompt] = useState('Bonjour, je veux connaître le prix et finaliser aujourd’hui.');
  const [freeTestsRemaining, setFreeTestsRemaining] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientStatus, setClientStatus] = useState('prospect');
  const [clientValue, setClientValue] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [editingClientId, setEditingClientId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderAutoSend, setReminderAutoSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(AUTO_SETTINGS_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<AutoSettings>;
        setAutoSettings({ ...DEFAULT_AUTO_SETTINGS, ...saved });
      })
      .catch(() => undefined);
    AsyncStorage.getItem(INSTRUCTION_ASSETS_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw) as BusinessInstructionAsset[];
        if (Array.isArray(saved)) setInstructionAssets(saved.filter(asset => asset?.url && asset?.name).slice(0, 20));
      })
      .catch(() => undefined);
  }, []);

  const saveAutoSettings = useCallback(async (next: AutoSettings) => {
    setAutoSettings(next);
    await AsyncStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const patchAutoSettings = useCallback((patch: Partial<AutoSettings>) => {
    void saveAutoSettings({ ...autoSettings, ...patch });
  }, [autoSettings, saveAutoSettings]);

  const saveInstructionAssets = useCallback(async (next: BusinessInstructionAsset[]) => {
    const clean = next.filter(asset => asset?.url && asset?.name).slice(0, 20);
    setInstructionAssets(clean);
    await AsyncStorage.setItem(INSTRUCTION_ASSETS_KEY, JSON.stringify(clean)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [businessResult, aiResult] = await Promise.allSettled([
        api.businessOverview(token),
        api.aiAutoOverview(token),
      ]);
      if (businessResult.status === 'fulfilled') setOverview(businessResult.value);
      else throw businessResult.reason;
      if (aiResult.status === 'fulfilled') {
        setAiOverview(aiResult.value);
        const config = aiResult.value?.config;
        if (config) {
          setAutoSettings(current => ({
            ...current,
            responseFrequency: delayToFrequency(config.delayMs),
            maxWords: String(config.maxWords || current.maxWords || DEFAULT_AUTO_SETTINGS.maxWords),
            dailyLimit: config.dailyLimit === null || config.dailyLimit === undefined ? current.dailyLimit : String(config.dailyLimit),
            recipientScope: RECIPIENT_SCOPE_OPTIONS.some(option => option.value === config.recipientScope) ? config.recipientScope : current.recipientScope,
            autoReplyEnabled: Boolean(config.isEnabled),
          }));
        }
        if (typeof aiResult.value?.freeTestsRemainingToday === 'number') {
          setFreeTestsRemaining(aiResult.value.freeTestsRemainingToday);
        }
      }
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Business indisponible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const clients = useMemo(() => Array.isArray(overview?.clients) ? overview.clients : [], [overview?.clients]);
  const reminders = useMemo(() => Array.isArray(overview?.reminders) ? overview.reminders : [], [overview?.reminders]);
  const payments = useMemo(() => Array.isArray(overview?.payments) ? overview.payments : [], [overview?.payments]);
  const access = overview?.access;
  const canAct = Boolean(access?.canAct);
  const subscriptionActive = Boolean(access?.subscriptionActive);
  const aiCreditsOk = Boolean(access?.aiCreditsOk);
  const monthlyPriceFcfa = BUSINESS_MONTHLY_PRICE_FCFA;
  const wordsRemaining = access?.wordsRemaining ?? aiOverview?.wallet?.wordsRemaining ?? aiOverview?.wordsRemaining ?? 0;
  const freeTestsPerDay = Number(aiOverview?.freeTestsPerDay || 5);
  const freeTestsRemainingToday = typeof freeTestsRemaining === 'number'
    ? freeTestsRemaining
    : typeof aiOverview?.freeTestsRemainingToday === 'number'
      ? aiOverview.freeTestsRemainingToday
      : freeTestsPerDay;
  const aiAutoEnabled = Boolean(aiOverview?.config?.isEnabled);
  const aiPaidActive = Boolean(aiOverview?.config?.paidActive || aiOverview?.paidActive || aiOverview?.freeAccess);
  const totalValue = clients.reduce((sum: number, client: any) => sum + (Number(client.value) || 0), 0);

  const requireBusinessAccess = useCallback((action = 'Action Business') => {
    if (canAct) return true;
    setNotice(!subscriptionActive
      ? `${action} bloquée : abonnement Business requis (${monthlyPriceFcfa.toLocaleString('fr-FR')} FCFA/mois) et crédit Gemini nécessaire.`
      : 'Action Business bloquée : crédit Gemini insuffisant. Rechargez l’IA pour utiliser l’agent commercial.');
    return false;
  }, [canAct, monthlyPriceFcfa, subscriptionActive]);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.businessInitializePaystack(token);
      if (data.authorizationUrl) await Linking.openURL(data.authorizationUrl);
      else await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement Business impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token]);

  const saveClient = useCallback(async () => {
    if (!clientName.trim()) return;
    if (!requireBusinessAccess('Enregistrement client')) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveClient(token, {
        id: editingClientId || undefined,
        name: clientName.trim(),
        phone: clientPhone.trim() || undefined,
        email: clientEmail.trim() || undefined,
        status: clientStatus,
        tags: [clientStatus],
        notes: clientNotes.trim(),
        value: Number(clientValue) || 0,
      });
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientStatus('prospect');
      setClientValue('');
      setClientNotes('');
      setEditingClientId('');
      await load();
      setNotice(editingClientId ? 'Client Business mis à jour.' : 'Client Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement client impossible.');
    } finally {
      setBusy(false);
    }
  }, [clientEmail, clientName, clientNotes, clientPhone, clientStatus, clientValue, editingClientId, load, requireBusinessAccess, token]);

  const editClient = useCallback((client: any) => {
    setMode('clients');
    setEditingClientId(client.id || '');
    setClientName(client.name || '');
    setClientPhone(client.phone || '');
    setClientEmail(client.email || '');
    setClientStatus(client.status || 'prospect');
    setClientValue(client.value ? String(client.value) : '');
    setClientNotes(client.notes || '');
  }, []);

  const exportClients = useCallback(async () => {
    if (!clients.length) {
      setNotice('Aucun client à exporter.');
      return;
    }
    const headers = ['Nom', 'Téléphone', 'Email', 'Statut', 'Valeur', 'Notes'];
    const rows = clients.map((client: any) => [
      client.name || '',
      client.phone || '',
      client.email || '',
      client.status || '',
      valueText(client.value || 0),
      String(client.notes || '').replace(/\n/g, ' '),
    ]);
    const csv = [headers, ...rows]
      .map((row: unknown[]) => row.map((cell: unknown) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    await Share.share({ title: 'Export Business Oracle Messenger', message: csv });
  }, [clients]);

  const businessLink = useMemo(() => 'https://messenger.oracle-plus.online/business', []);

  const formatTemplate = useCallback((template: string, client?: any) => template
    .replace(/\{nom\}/gi, client?.name || 'client')
    .replace(/\{lien\}/gi, businessLink)
    .replace(/\{montant\}/gi, client?.value ? `${Number(client.value).toLocaleString('fr-FR')} FCFA` : '')
    .replace(/\{paiement\}/gi, autoSettings.paymentLink || `[${autoSettings.paymentProvider}]`), [autoSettings.paymentLink, autoSettings.paymentProvider, businessLink]);

  const openClientMessage = useCallback(async (client: any) => {
    if (!requireBusinessAccess('Message client')) return;
    const phone = String(client.phone || '').replace(/\D/g, '');
    const text = formatTemplate(client.autoMessage || autoSettings.welcomeMessage, client);
    if (!phone) {
      await Share.share({ title: 'Message Business', message: text });
      return;
    }
    const parsedPhone = String(client.phone || '').trim();
    const hasInternationalPrefix = parsedPhone.startsWith('+') || parsedPhone.startsWith('00');
    const url = hasInternationalPrefix
      ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`
      : `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(text)}`;
    await Linking.openURL(url).catch(async () => {
      await Share.share({ title: 'Message Business', message: text });
    });
  }, [autoSettings.welcomeMessage, formatTemplate, requireBusinessAccess]);

  const uploadInstructionAsset = useCallback(async (input: { uri: string; name?: string; mime?: string; kind: BusinessInstructionAssetKind; size?: number }) => {
    setBusy(true);
    setNotice('');
    try {
      const mime = input.mime || 'application/octet-stream';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(input.uri, mime),
        name: input.name || `support-business-${Date.now()}`,
        mime,
        kind: input.kind === 'document' ? 'file' : input.kind,
      });
      const asset: BusinessInstructionAsset = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: uploaded.name || input.name || 'support-business',
        url: uploaded.url,
        mime: uploaded.mime || mime,
        kind: input.kind,
        size: uploaded.size || input.size,
        addedAt: new Date().toISOString(),
      };
      await saveInstructionAssets([asset, ...instructionAssets].slice(0, 20));
      setNotice('Support ajouté aux consignes Gemini. Enregistrez Auto IA pour le synchroniser côté serveur.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ajout du support impossible.');
    } finally {
      setBusy(false);
    }
  }, [instructionAssets, saveInstructionAssets, token]);

  const pickInstructionMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour charger une image ou vidéo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    await uploadInstructionAsset({
      uri: asset.uri,
      name: asset.fileName || `support-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
      size: (asset as any).fileSize,
    });
  }, [setNotice, uploadInstructionAsset]);

  const pickInstructionDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', 'image/*', 'video/*', 'text/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;
    const mime = asset.mimeType || 'application/octet-stream';
    await uploadInstructionAsset({
      uri: asset.uri,
      name: asset.name || `document-${Date.now()}`,
      mime,
      kind: mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document',
      size: asset.size,
    });
  }, [uploadInstructionAsset]);

  const removeInstructionAsset = useCallback(async (assetId: string) => {
    await saveInstructionAssets(instructionAssets.filter(asset => asset.id !== assetId));
    setNotice('Support retiré des consignes locales. Enregistrez Auto IA pour mettre à jour le serveur.');
  }, [instructionAssets, saveInstructionAssets]);

  const previewAiMessage = useCallback(async (kind: 'reply' | 'followup' | 'priority', customMessage?: string) => {
    const client = clients[0] || { name: 'Prospect', value: 0 };
    const clientMessage = customMessage?.trim() || (kind === 'reply'
      ? 'Bonjour, je veux connaître le tarif et réserver rapidement.'
      : kind === 'followup'
        ? 'Je n’ai pas encore finalisé, pouvez-vous me rappeler l’offre ?'
        : 'Signal : client chaud avec intention forte et demande de paiement.');
    const clientBubble: BusinessAiMessage = { role: 'client', text: clientMessage };
    const fallbackAgentMessage = kind === 'reply'
      ? `Bonjour ${client.name}, merci pour votre message. Je peux vous envoyer l’offre claire, le tarif et le lien de paiement pour finaliser rapidement.`
      : kind === 'followup'
        ? `Bonjour ${client.name}, je reviens vers vous simplement. Voulez-vous finaliser aujourd’hui ou recevoir une dernière précision avant de décider ?`
        : `${client.name} est une priorité : intention d’achat forte, action recommandée maintenant avec lien de paiement et réponse rapide.`;
    setBusinessAiMessages([
      clientBubble,
      { role: 'system', text: 'Gemini prépare une réponse commerciale de démonstration.' },
    ]);
    setBusy(true);
    try {
      const prompt = `[Agent commercial Oracle Business]
Client: ${client.name || 'Prospect'}
Message reçu: ${clientMessage}
Objectif: ${kind === 'reply' ? 'répondre clairement et aider à finaliser' : kind === 'followup' ? 'faire une relance polie et efficace' : 'analyser la priorité commerciale et proposer la prochaine action'}.
Réponds en français, court, professionnel, orienté vente et suivi client.`;
      const data = await api.aiAutoTest(token, prompt, 'tools');
      if (typeof data.freeTestsRemainingToday === 'number') {
        setFreeTestsRemaining(data.freeTestsRemainingToday);
      }
      setBusinessAiMessages([
        clientBubble,
        { role: 'agent', text: data.response || fallbackAgentMessage },
        { role: 'system', text: canAct ? 'Mode actif : avec abonnement Business et crédit Gemini, cet agent classe les clients, prépare les relances et suit les conversations.' : 'Mode aperçu : aucune action réelle n’est déclenchée sans abonnement Business actif et crédit Gemini.' },
      ]);
      if (typeof data.freeTestsRemainingToday === 'number' && data.freeTestsRemainingToday <= 0) {
        setNotice(`Vous avez utilisé vos ${freeTestsPerDay} tests IA gratuits. Activez Business et rechargez Gemini pour continuer.`);
      }
    } catch {
      setBusinessAiMessages([
        clientBubble,
        { role: 'agent', text: fallbackAgentMessage },
        { role: 'system', text: canAct ? 'Mode actif : agent commercial disponible.' : 'Mode aperçu : simulation locale, aucune action réelle.' },
      ]);
    } finally {
      setBusy(false);
    }
  }, [canAct, clients, freeTestsPerDay, token]);

  const saveGeminiAutomation = useCallback(async () => {
    const frequency = RESPONSE_FREQUENCY_OPTIONS.find(option => option.value === autoSettings.responseFrequency) || RESPONSE_FREQUENCY_OPTIONS[2];
    const maxWords = Math.max(30, Math.min(300, Math.round(Number(autoSettings.maxWords) || 80)));
    const dailyLimitValue = autoSettings.dailyLimit.trim() ? Math.max(1, Math.min(5000, Math.round(Number(autoSettings.dailyLimit) || 200))) : null;
    const nextSettings: AutoSettings = {
      ...autoSettings,
      maxWords: String(maxWords),
      dailyLimit: dailyLimitValue === null ? '' : String(dailyLimitValue),
    };
    setBusy(true);
    setNotice('');
    try {
      await saveAutoSettings(nextSettings);
      const data = await api.aiAutoSaveConfig(token, {
        prompt: buildBusinessGeminiPrompt(nextSettings, instructionAssets),
        delayMs: frequency.delayMs,
        maxWords,
        recipientScope: nextSettings.recipientScope,
        isEnabled: nextSettings.autoReplyEnabled,
        dailyLimit: dailyLimitValue,
      });
      setAiOverview((current: any) => ({ ...(current || {}), ...(data || {}) }));
      if (data?.blocked) {
        setNotice(`Consignes Gemini enregistrées. Activation automatique bloquée : ${data.blocked}`);
      } else {
        setNotice(nextSettings.autoReplyEnabled
          ? 'Consignes Gemini enregistrées. L’agent répond, classe et relance selon vos réglages.'
          : 'Consignes Gemini enregistrées. Activez Réponse auto pour laisser l’agent agir seul.');
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement des consignes Gemini impossible.');
    } finally {
      setBusy(false);
    }
  }, [autoSettings, instructionAssets, load, saveAutoSettings, token]);

  const activateBusinessAgent = useCallback(async () => {
    const frequency = RESPONSE_FREQUENCY_OPTIONS.find(option => option.value === autoSettings.responseFrequency) || RESPONSE_FREQUENCY_OPTIONS[2];
    const maxWords = Math.max(30, Math.min(300, Math.round(Number(autoSettings.maxWords) || 80)));
    const dailyLimitValue = autoSettings.dailyLimit.trim() ? Math.max(1, Math.min(5000, Math.round(Number(autoSettings.dailyLimit) || 200))) : null;
    const nextSettings: AutoSettings = {
      ...autoSettings,
      autoReplyEnabled: true,
      classificationEnabled: true,
      reminderAutomationEnabled: true,
      invoiceReadingEnabled: true,
      clientMemoryEnabled: true,
      maxWords: String(maxWords),
      dailyLimit: dailyLimitValue === null ? '' : String(dailyLimitValue),
    };
    setMode('auto');
    setBusy(true);
    setNotice('');
    try {
      await saveAutoSettings(nextSettings);
      const data = await api.aiAutoSaveConfig(token, {
        prompt: buildBusinessGeminiPrompt(nextSettings, instructionAssets),
        delayMs: frequency.delayMs,
        maxWords,
        recipientScope: nextSettings.recipientScope,
        isEnabled: true,
        dailyLimit: dailyLimitValue,
      });
      setAiOverview((current: any) => ({ ...(current || {}), ...(data || {}) }));
      if (data?.blocked) {
        setNotice(`Agent prêt mais non activé : ${data.blocked}. Payez Business et rechargez Gemini.`);
      } else {
        setNotice('Agent Business activé : Gemini peut répondre, classer, relancer et analyser les documents selon vos consignes.');
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Activation de l’agent Business impossible.');
    } finally {
      setBusy(false);
    }
  }, [autoSettings, instructionAssets, load, saveAutoSettings, token]);

  const runCustomBusinessAiTest = useCallback(async () => {
    const message = businessTestPrompt.trim();
    if (!message) {
      setNotice('Écrivez un message client pour tester votre agent IA.');
      return;
    }
    await previewAiMessage('reply', message);
  }, [businessTestPrompt, previewAiMessage]);

  const saveReminder = useCallback(async () => {
    if (!reminderDate.trim()) return;
    if (reminderAutoSend && !selectedClientId) {
      setNotice('Choisissez un client lié à une conversation Oracle Messenger pour programmer une relance automatique.');
      return;
    }
    if (!requireBusinessAccess('Création rappel')) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveReminder(token, {
        clientId: selectedClientId || undefined,
        dueAt: reminderDate.trim(),
        note: reminderNote.trim(),
        autoSend: reminderAutoSend,
      });
      setReminderDate('');
      setReminderNote('');
      await load();
      setNotice(reminderAutoSend
        ? 'Relance automatique enregistrée. Gemini enverra le message à la date prévue si le client est relié à une conversation.'
        : 'Rappel manuel Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, reminderAutoSend, reminderDate, reminderNote, requireBusinessAccess, selectedClientId, token]);

  const markDone = useCallback(async (id: string, done: boolean) => {
    if (!requireBusinessAccess('Mise à jour rappel')) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessMarkReminderDone(token, id, done);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mise à jour rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, requireBusinessAccess, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.businessHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour aux discussions"
          onPress={onBack}
          style={styles.businessBack}
          android_ripple={{ color: 'rgba(255,255,255,0.14)', borderless: true }}
        >
          <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.7} />
        </Pressable>
        <View style={styles.businessHeaderText}>
          <Text numberOfLines={1} style={styles.businessHeaderTitle}>Business Assistant</Text>
          <Text numberOfLines={1} style={styles.businessHeaderSubtitle}>{clients.length} clients · {reminders.length} rappels · {totalValue.toLocaleString('fr-FR')} FCFA</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un client"
          onPress={() => setMode('clients')}
          style={styles.businessAdd}
          android_ripple={{ color: 'rgba(255,255,255,0.14)', borderless: true }}
        >
          <Plus size={22} color="#FFFFFF" strokeWidth={3} />
        </Pressable>
      </View>
      <View style={styles.businessTabsWrap}>
        {(['clients', 'reminders', 'stats', 'auto'] as const).map(item => (
          <Pressable key={item} onPress={() => setMode(item)} style={[styles.businessTab, mode === item && styles.businessTabActive]}>
            <Text numberOfLines={1} style={[styles.businessTabText, mode === item && styles.businessTabTextActive]}>{item === 'clients' ? 'Clients' : item === 'reminders' ? 'Rappels' : item === 'stats' ? 'Stats' : 'Auto IA'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.businessIntro}>
        <View style={styles.aiHeroCard}>
          <View style={styles.aiHeroHeader}>
            <View style={styles.aiHeroBadge}><Text style={styles.aiHeroBadgeText}>IA</Text></View>
            <View style={styles.aiHeroCopy}>
              <View style={styles.aiHeroPills}>
                <Text style={styles.aiHeroPill}>Agent commercial Gemini</Text>
                <Text style={styles.aiHeroMuted}>{canAct ? 'Automatisation active' : 'Aperçu gratuit'}</Text>
              </View>
              <Text style={styles.aiHeroTitle}>Automatisation client d’entreprise</Text>
              <Text style={styles.aiHeroText}>Gemini se comporte comme un agent commercial : il prépare les réponses, suit les prospects, classe les clients, détecte les priorités et propose les relances.</Text>
            </View>
          </View>
          <View style={styles.aiFeatureGrid}>
            {[
              'Répondre automatiquement aux prospects depuis les conversations.',
              'Classer les clients : chaud, froid, payé ou à relancer.',
              'Créer des rappels et suivis commerciaux.',
              'Proposer la prochaine action à faire.',
              'Analyser les statistiques et les priorités.',
              'Faire gagner du temps chaque semaine.',
            ].map(feature => (
              <Text key={feature} style={styles.aiFeature}>{feature}</Text>
            ))}
          </View>
          <View style={styles.aiHeroActions}>
            <Pressable style={styles.goldButton} onPress={() => void previewAiMessage('reply')}>
              <Text style={styles.goldButtonText}>Tester avec démo</Text>
            </Pressable>
            <Pressable style={styles.darkGhostButton} onPress={() => setMode('auto')}>
              <Text style={styles.darkGhostButtonText}>Voir Auto IA</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionTop}>
            <View style={styles.subscriptionBadge}><Text style={styles.subscriptionBadgeText}>PRO</Text></View>
            <View style={styles.subscriptionCopy}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Activer l’abonnement Business Pro"
                onPress={pay}
                disabled={busy || access?.isAdmin}
              >
                <Text style={[styles.subscriptionTitle, !subscriptionActive && styles.subscriptionTitleLink]}>
                  Abonnement Business Pro
                </Text>
              </Pressable>
              <Text style={styles.subscriptionText}>Débloque l’agent commercial autonome, le CRM IA, les relances, le classement client et le suivi des factures.</Text>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceValue}>{monthlyPriceFcfa.toLocaleString('fr-FR')}</Text>
              <Text style={styles.priceLabel}>FCFA/mois</Text>
            </View>
          </View>
          <View style={styles.requirementList}>
            <View style={[styles.requirementRow, subscriptionActive && styles.requirementRowOk]}>
              <Text style={styles.requirementMark}>{subscriptionActive ? '✓' : '!'}</Text>
              <Text style={styles.requirementText}>{subscriptionActive ? 'Abonnement Business actif' : 'Abonnement Business requis'}</Text>
            </View>
            <View style={[styles.requirementRow, aiCreditsOk && styles.requirementRowOk]}>
              <Text style={styles.requirementMark}>{aiCreditsOk ? '✓' : '!'}</Text>
              <Text style={styles.requirementText}>Crédit Gemini séparé pour l’écriture IA : {access?.isAdmin ? 'Illimité' : `${valueText(wordsRemaining)} mots`}</Text>
            </View>
          </View>
          <View style={styles.subscriptionActions}>
            <Pressable onPress={pay} disabled={busy || access?.isAdmin} style={[styles.payButton, (busy || access?.isAdmin) && styles.disabledButton]}>
              <Text style={styles.payButtonText}>{subscriptionActive ? 'Renouveler Business Pro' : `Activer Business Pro - ${monthlyPriceFcfa.toLocaleString('fr-FR')} FCFA/mois`}</Text>
            </Pressable>
            <Pressable onPress={onOpenAiTools || (() => setMode('auto'))} disabled={busy} style={[styles.rechargeButton, busy && styles.disabledButton]}>
              <Text style={styles.rechargeButtonText}>Recharger Gemini IA</Text>
            </Pressable>
          </View>
          <Text style={styles.subscriptionFootnote}>Business Pro active l’espace entreprise à {monthlyPriceFcfa.toLocaleString('fr-FR')} FCFA/mois. L’écriture IA se recharge séparément avec le crédit Gemini.</Text>
        </View>

        <View style={styles.activationCard}>
          <Text style={styles.activationTitle}>Mettre l’agent au travail</Text>
          <Text style={styles.activationText}>Le parcours est simple : activez Business, rechargez Gemini, donnez vos consignes et ajoutez vos supports. Ensuite l’agent peut répondre comme un commercial, classer les clients et programmer les relances.</Text>
          <View style={styles.activationSteps}>
            {[
              { index: '1', title: 'Business', text: subscriptionActive ? 'Abonnement actif' : `Payer ${monthlyPriceFcfa.toLocaleString('fr-FR')} FCFA/mois`, action: pay },
              { index: '2', title: 'Gemini', text: aiCreditsOk ? `${valueText(wordsRemaining)} mots disponibles` : 'Recharger le crédit Gemini', action: onOpenAiTools || (() => setMode('auto')) },
              { index: '3', title: 'Consignes', text: `${instructionAssets.length} support${instructionAssets.length > 1 ? 's' : ''} chargé${instructionAssets.length > 1 ? 's' : ''}`, action: () => setMode('auto') },
            ].map(step => (
              <Pressable key={step.index} onPress={step.action} disabled={busy} style={styles.activationStep}>
                <Text style={styles.activationStepIndex}>{step.index}</Text>
                <View style={styles.activationStepCopy}>
                  <Text style={styles.activationStepTitle}>{step.title}</Text>
                  <Text style={styles.activationStepText}>{step.text}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={styles.actionRow}>
            <PrimaryButton label={aiAutoEnabled ? 'Agent déjà actif' : 'Activer l’agent IA'} onPress={activateBusinessAgent} disabled={busy || aiAutoEnabled} />
            <SecondaryButton label="Ajouter support" onPress={pickInstructionMedia} disabled={busy} />
          </View>
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewHead}>
            <View style={styles.previewCopy}>
              <Text style={styles.previewTitle}>Essayer l’IA avant validation</Text>
              <Text style={styles.previewText}>{freeTestsPerDay} tests gratuits par jour. L’usage réel demande Business actif et crédit Gemini.</Text>
            </View>
            <Text style={styles.freeBadge}>{canAct ? 'Actif' : `${freeTestsRemainingToday}/${freeTestsPerDay}`}</Text>
          </View>
          <TextInput
            value={businessTestPrompt}
            onChangeText={setBusinessTestPrompt}
            placeholder="Écrivez le message du client..."
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.input, styles.aiTestField]}
          />
          <PrimaryButton label="Envoyer au test IA" onPress={runCustomBusinessAiTest} disabled={busy || !businessTestPrompt.trim()} />
          <View style={styles.miniChat}>
            {businessAiMessages.slice(-3).map((message, index) => (
              <View key={`preview-${message.role}-${index}`} style={[styles.aiMessage, message.role === 'client' ? styles.aiMessageClient : message.role === 'system' ? styles.aiMessageSystem : styles.aiMessageAgent]}>
                <Text style={[styles.aiRole, message.role === 'client' && styles.aiRoleOnDark]}>{message.role === 'client' ? 'Client' : message.role === 'agent' ? 'Agent IA' : 'Système'}</Text>
                <Text style={[styles.aiMessageText, message.role === 'client' && styles.aiMessageTextOnDark]}>{message.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.previewActions}>
            <Pressable style={styles.previewButton} onPress={() => void previewAiMessage('reply')}><Text style={styles.previewButtonText}>Réponse IA</Text></Pressable>
            <Pressable style={styles.previewButton} onPress={() => void previewAiMessage('followup')}><Text style={styles.previewButtonText}>Relance</Text></Pressable>
            <Pressable style={styles.previewButton} onPress={() => void previewAiMessage('priority')}><Text style={styles.previewButtonText}>Priorité</Text></Pressable>
          </View>
        </View>

        <View style={styles.startCard}>
          <Text style={styles.startTitle}>Commencez votre business ici</Text>
          <Text style={styles.startText}>Ajoutez un client, donnez-lui un statut, programmez la prochaine relance et laissez Gemini préparer le suivi.</Text>
          <View style={styles.startActions}>
            <Pressable style={styles.goldButton} onPress={() => setMode('clients')}><Text style={styles.goldButtonText}>+ Client</Text></Pressable>
            <Pressable style={styles.darkGhostButton} onPress={() => setMode('reminders')}><Text style={styles.darkGhostButtonText}>Rappels</Text></Pressable>
            <Pressable style={styles.darkGhostButton} onPress={() => setMode('stats')}><Text style={styles.darkGhostButtonText}>Stats</Text></Pressable>
          </View>
        </View>

        <View style={styles.toolGrid}>
          {[
            { title: 'Pipeline', text: 'Suivez prospect, chaud, relancer, payé.' },
            { title: 'Relance', text: 'Programmez les rappels clients importants.' },
            { title: 'Paiement', text: 'Insérez votre lien dans les réponses.' },
            { title: 'Priorité IA', text: 'Gemini repère les clients à traiter vite.' },
          ].map(tool => (
            <View key={tool.title} style={styles.toolCard}>
              <Text style={styles.toolTitle}>{tool.title}</Text>
              <Text style={styles.toolText}>{tool.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsGrid}>
          <Stat label="Clients" value={clients.length} />
          <Stat label="Relances" value={reminders.length} />
          <Stat label="Paiements" value={payments.length} />
          <Stat label="Accès" value={canAct ? 'Actif' : 'Bloqué'} />
        </View>
        <View style={styles.actionRow}>
          <SecondaryButton label="Exporter clients" onPress={exportClients} disabled={!clients.length} />
          {editingClientId ? <SecondaryButton label="Annuler édition" onPress={() => {
            setEditingClientId('');
            setClientName('');
            setClientPhone('');
            setClientEmail('');
            setClientStatus('prospect');
            setClientValue('');
            setClientNotes('');
          }} disabled={busy} /> : null}
        </View>
        <Loading active={busy} />
        <AlertText text={notice} />
      </View>

      {mode === 'clients' ? (
        <Section title="Clients">
          <TextInput value={clientName} onChangeText={setClientName} placeholder="Nom client" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={styles.actionRow}>
            <TextInput value={clientPhone} onChangeText={setClientPhone} placeholder="Téléphone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.input, styles.inlineInput]} />
            <TextInput value={clientEmail} onChangeText={setClientEmail} placeholder="Email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, styles.inlineInput]} />
          </View>
          <View style={styles.segment}>
            {BUSINESS_STATUS_OPTIONS.map(status => (
              <Pressable key={status} onPress={() => setClientStatus(status)} style={[styles.segmentItem, clientStatus === status && styles.segmentActive]}>
                <Text style={[styles.segmentText, clientStatus === status && styles.segmentTextActive]}>{status === 'paye' ? 'payé' : status}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={clientValue} onChangeText={setClientValue} placeholder="Valeur FCFA" placeholderTextColor={colors.muted} keyboardType="numeric" style={styles.input} />
          <TextInput value={clientNotes} onChangeText={setClientNotes} placeholder="Notes" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <PrimaryButton label={editingClientId ? 'Mettre à jour client' : 'Enregistrer client'} onPress={saveClient} disabled={busy || !clientName.trim()} />
          {!clients.length ? <Text style={styles.empty}>Aucun client Business.</Text> : null}
          {clients.map((client: any) => (
            <View key={client.id} style={[styles.card, ['chaud', 'vip'].includes(String(client.status || '').toLowerCase()) && styles.hotClientCard]}>
              <View style={styles.clientCardHead}>
                <View style={styles.clientCardText}>
                  <Text style={styles.cardTitle}>{client.name || 'Client'}</Text>
                  <Text style={styles.cardText}>{client.phone || client.email || 'Coordonnées non renseignées'}</Text>
                </View>
                <View style={[styles.statusBadge, String(client.status || '').toLowerCase() === 'paye' && styles.statusBadgeSoft]}>
                  <Text style={styles.statusBadgeText}>{client.status === 'paye' ? 'Payé' : client.status || 'Prospect'}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{valueText(client.value || 0)} FCFA • {client.updatedAt ? new Date(client.updatedAt).toLocaleString('fr-FR') : ''}</Text>
              {client.notes ? <Text numberOfLines={3} style={styles.cardText}>{client.notes}</Text> : null}
              <SecondaryButton label="Modifier" onPress={() => editClient(client)} disabled={busy} />
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'reminders' ? (
        <Section title="Rappels">
          <View style={styles.segment}>
            <Pressable onPress={() => setSelectedClientId('')} style={[styles.segmentItem, !selectedClientId && styles.segmentActive]}>
              <Text style={[styles.segmentText, !selectedClientId && styles.segmentTextActive]}>Général</Text>
            </Pressable>
            {clients.slice(0, 8).map((client: any) => (
              <Pressable key={client.id} onPress={() => setSelectedClientId(client.id)} style={[styles.segmentItem, selectedClientId === client.id && styles.segmentActive]}>
                <Text numberOfLines={1} style={[styles.segmentText, selectedClientId === client.id && styles.segmentTextActive]}>{client.name}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={reminderDate} onChangeText={setReminderDate} placeholder="Date ISO: 2026-08-12T09:00:00Z" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={reminderNote} onChangeText={setReminderNote} placeholder="Note du rappel" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <View style={styles.reminderModeCard}>
            <Text style={styles.cardTitle}>Mode de relance</Text>
            <Text style={styles.cardText}>{reminderAutoSend ? 'Gemini enverra automatiquement le message à la date prévue si le client est lié à une conversation Oracle Messenger.' : 'Le rappel restera dans votre liste. Aucun message ne partira automatiquement.'}</Text>
            <View style={styles.segment}>
              <Pressable onPress={() => setReminderAutoSend(true)} style={[styles.segmentItem, reminderAutoSend && styles.segmentActive]}>
                <Text style={[styles.segmentText, reminderAutoSend && styles.segmentTextActive]}>Auto IA</Text>
              </Pressable>
              <Pressable onPress={() => setReminderAutoSend(false)} style={[styles.segmentItem, !reminderAutoSend && styles.segmentActive]}>
                <Text style={[styles.segmentText, !reminderAutoSend && styles.segmentTextActive]}>Manuel</Text>
              </Pressable>
            </View>
          </View>
          <PrimaryButton label={reminderAutoSend ? 'Programmer relance IA' : 'Créer rappel manuel'} onPress={saveReminder} disabled={busy || !reminderDate.trim()} />
          {!reminders.length ? <Text style={styles.empty}>Aucun rappel Business.</Text> : null}
          {reminders.map((reminder: any) => (
            <View key={reminder.id} style={styles.card}>
              <Text style={styles.cardTitle}>{reminder.title || 'Rappel Business'}</Text>
              <Text style={styles.cardText}>{reminder.note || 'Sans note'}</Text>
              <Text style={styles.cardMeta}>{reminder.dueAt ? new Date(reminder.dueAt).toLocaleString('fr-FR') : ''} • {reminder.done ? 'Terminé' : 'À faire'} • {reminder.source === 'ai_auto' ? 'Auto IA' : 'Manuel'}</Text>
              <SecondaryButton label={reminder.done ? 'Réouvrir' : 'Terminer'} onPress={() => markDone(reminder.id, !reminder.done)} disabled={busy} />
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'stats' ? (
        <Section title="Statistiques Business">
          <View style={styles.statsGrid}>
            <Stat label="Actifs" value={clients.filter((client: any) => client.status !== 'perdu').length} />
            <Stat label="Payés" value={clients.filter((client: any) => client.status === 'paye').length} />
            <Stat label="Valeur" value={clients.reduce((sum: number, client: any) => sum + (Number(client.value) || 0), 0)} />
            <Stat label="À faire" value={reminders.filter((reminder: any) => !reminder.done).length} />
          </View>
          {payments.map((payment: any) => (
            <View key={payment.id || payment.reference} style={styles.card}>
              <Text style={styles.cardTitle}>{payment.reference || 'Paiement'}</Text>
              <Text style={styles.cardMeta}>{payment.status || 'pending'} • {valueText(payment.amountFcfa || 0)} FCFA • {payment.createdAt ? new Date(payment.createdAt).toLocaleString('fr-FR') : ''}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'auto' ? (
        <Section title="Auto IA">
          <View style={styles.autoHero}>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>G</Text></View>
            <View style={styles.autoHeroText}>
              <Text style={styles.autoHeroTitle}>Agent commercial Gemini</Text>
              <Text style={styles.autoHeroSub}>Branché aux conversations : il répond, classe, relance et nourrit le suivi client quand Business + crédit Gemini sont actifs.</Text>
            </View>
          </View>
          <View style={styles.automationStatusCard}>
            <View style={styles.automationStatusRow}>
              <Text style={styles.automationStatusLabel}>Abonnement Business</Text>
              <Text style={[styles.automationStatusValue, subscriptionActive && styles.automationStatusOk]}>{subscriptionActive ? 'Actif' : 'Requis'}</Text>
            </View>
            <View style={styles.automationStatusRow}>
              <Text style={styles.automationStatusLabel}>Crédit Gemini</Text>
              <Text style={[styles.automationStatusValue, aiCreditsOk && styles.automationStatusOk]}>{access?.isAdmin ? 'Illimité' : aiCreditsOk ? `${valueText(wordsRemaining)} mots` : 'Insuffisant'}</Text>
            </View>
            <View style={styles.automationStatusRow}>
              <Text style={styles.automationStatusLabel}>Auto-réponse Gemini</Text>
              <Text style={[styles.automationStatusValue, aiAutoEnabled && styles.automationStatusOk]}>{aiAutoEnabled ? 'Activée' : aiPaidActive ? 'À activer' : 'Paiement IA requis'}</Text>
            </View>
            <Text style={styles.automationStatusText}>Les outils modernes de suivi client ne s’exécutent réellement que si l’abonnement Business est actif et si Gemini dispose de crédit d’utilisation.</Text>
          </View>
          <View style={styles.actionRow}>
            <SecondaryButton label="Tester réponse" onPress={() => void previewAiMessage('reply')} />
            <SecondaryButton label="Tester relance" onPress={() => void previewAiMessage('followup')} />
            <SecondaryButton label="Voir priorité" onPress={() => void previewAiMessage('priority')} />
            <SecondaryButton label="Recharger Gemini" onPress={onOpenAiTools || (() => setMode('auto'))} />
            <PrimaryButton label={aiAutoEnabled ? 'Agent actif' : 'Activer agent'} onPress={activateBusinessAgent} disabled={busy || aiAutoEnabled} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Consignes à Gemini</Text>
            <Text style={styles.cardText}>Définissez comment l’agent doit vendre, relancer, classer les clients et traiter les factures. Ces consignes sont envoyées au backend IA.</Text>
            <Text style={styles.fieldLabel}>Entreprise, offre et règles commerciales</Text>
            <TextInput
              value={autoSettings.businessDescription}
              onChangeText={text => patchAutoSettings({ businessDescription: text })}
              placeholder="Exemple : nous vendons des abonnements, livraison sous 24h, acompte obligatoire..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.fieldLabel}>Instructions de l’agent commercial</Text>
            <TextInput
              value={autoSettings.geminiInstructions}
              onChangeText={text => patchAutoSettings({ geminiInstructions: text })}
              placeholder="Expliquez à Gemini comment répondre, classer, relancer et quand demander validation."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.largeTextarea]}
            />
            <View style={styles.flagGrid}>
              {AUTOMATION_FLAGS.map(flag => {
                const active = Boolean(autoSettings[flag.key]);
                return (
                  <Pressable
                    key={flag.key}
                    onPress={() => patchAutoSettings({ [flag.key]: !active } as Partial<AutoSettings>)}
                    style={[styles.flagCard, active && styles.flagCardActive]}
                  >
                    <Text style={[styles.flagTitle, active && styles.flagTitleActive]}>{flag.label}</Text>
                    <Text style={[styles.flagText, active && styles.flagTextActive]}>{flag.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Supports de l’agent</Text>
            <Text style={styles.cardText}>Chargez vos catalogues, images, vidéos, fiches tarifs, factures modèles ou documents de vente. Si une conversation le demande, Gemini pourra utiliser le lien ou envoyer le média via le marqueur sécurisé ajouté au prompt.</Text>
            <View style={styles.actionRow}>
              <SecondaryButton label="Image / vidéo" onPress={pickInstructionMedia} disabled={busy} />
              <SecondaryButton label="Document" onPress={pickInstructionDocument} disabled={busy} />
            </View>
            {!instructionAssets.length ? <Text style={styles.empty}>Aucun support chargé. Ajoutez au moins un fichier si l’agent doit partager un catalogue, une image ou une vidéo.</Text> : null}
            {instructionAssets.map(asset => (
              <View key={asset.id} style={styles.assetRow}>
                <View style={styles.assetIcon}><Text style={styles.assetIconText}>{asset.kind === 'image' ? 'IMG' : asset.kind === 'video' ? 'VID' : 'DOC'}</Text></View>
                <View style={styles.assetCopy}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{asset.name}</Text>
                  <Text numberOfLines={1} style={styles.cardMeta}>{asset.mime} • {asset.size ? `${Math.round(asset.size / 1024)} Ko` : 'taille inconnue'}</Text>
                </View>
                <SecondaryButton label="Retirer" onPress={() => void removeInstructionAsset(asset.id)} disabled={busy} />
              </View>
            ))}
            <PrimaryButton label="Synchroniser supports et consignes" onPress={saveGeminiAutomation} disabled={busy} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cadence et limites</Text>
            <Text style={styles.cardText}>Le gratuit reste limité côté serveur à une réponse courte. En mode payé, vous pouvez définir la longueur et le rythme de réponse.</Text>
            <Text style={styles.fieldLabel}>Temps avant réponse</Text>
            <View style={styles.segment}>
              {RESPONSE_FREQUENCY_OPTIONS.map(option => (
                <Pressable key={option.value} onPress={() => patchAutoSettings({ responseFrequency: option.value })} style={[styles.segmentItem, autoSettings.responseFrequency === option.value && styles.segmentActive]}>
                  <Text style={[styles.segmentText, autoSettings.responseFrequency === option.value && styles.segmentTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Mots max/réponse</Text>
                <TextInput value={autoSettings.maxWords} onChangeText={text => patchAutoSettings({ maxWords: text })} keyboardType="numeric" placeholder="80" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Limite/jour</Text>
                <TextInput value={autoSettings.dailyLimit} onChangeText={text => patchAutoSettings({ dailyLimit: text })} keyboardType="numeric" placeholder="200" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
            </View>
            <View style={styles.actionRow}>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Heure de relance</Text>
                <TextInput value={autoSettings.followupHour} onChangeText={text => patchAutoSettings({ followupHour: text })} placeholder="09:00" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Fréquence</Text>
                <View style={styles.compactSegment}>
                  {FOLLOWUP_FREQUENCY_OPTIONS.map(option => (
                    <Pressable key={option.value} onPress={() => patchAutoSettings({ followupFrequency: option.value })} style={[styles.compactSegmentItem, autoSettings.followupFrequency === option.value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, autoSettings.followupFrequency === option.value && styles.segmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Text style={styles.fieldLabel}>Qui peut recevoir une réponse automatique</Text>
            <View style={styles.segment}>
              {RECIPIENT_SCOPE_OPTIONS.map(option => (
                <Pressable key={option.value} onPress={() => patchAutoSettings({ recipientScope: option.value })} style={[styles.segmentItem, autoSettings.recipientScope === option.value && styles.segmentActive]}>
                  <Text style={[styles.segmentText, autoSettings.recipientScope === option.value && styles.segmentTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Factures, paiements et relances</Text>
            <Text style={styles.cardText}>Gemini utilise ces règles pour traiter les messages parlant de facture, reçu, devis, paiement ou commande. La variable {'{paiement}'} ajoute votre lien de paiement.</Text>
            <TextInput
              value={autoSettings.invoiceInstructions}
              onChangeText={text => patchAutoSettings({ invoiceInstructions: text })}
              placeholder="Comment Gemini doit analyser les factures et preuves de paiement..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.fieldLabel}>Message d’accueil ou relance type</Text>
            <TextInput
              value={autoSettings.welcomeMessage}
              onChangeText={text => patchAutoSettings({ welcomeMessage: text })}
              placeholder="Message automatique"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.fieldLabel}>Lien de paiement client</Text>
            <View style={styles.actionRow}>
              {(['CinetPay', 'Babimo', 'Flutterwave', 'Paystack', 'Autre'] as const).map(provider => (
                <Pressable key={provider} onPress={() => patchAutoSettings({ paymentProvider: provider })} style={[styles.segmentItem, autoSettings.paymentProvider === provider && styles.segmentActive]}>
                  <Text style={[styles.segmentText, autoSettings.paymentProvider === provider && styles.segmentTextActive]}>{provider}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={autoSettings.paymentLink}
              onChangeText={text => patchAutoSettings({ paymentLink: text })}
              placeholder="https://lien-de-paiement..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <PrimaryButton label={autoSettings.autoReplyEnabled ? 'Enregistrer et activer Gemini' : 'Enregistrer les consignes'} onPress={saveGeminiAutomation} disabled={busy} />
              <SecondaryButton label="Copier {paiement}" onPress={() => void Clipboard.setStringAsync('{paiement}')} />
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Test assistant Business</Text>
            {businessAiMessages.map((message, index) => (
              <View key={`${message.role}-${index}`} style={[styles.aiMessage, message.role === 'client' ? styles.aiMessageClient : message.role === 'system' ? styles.aiMessageSystem : styles.aiMessageAgent]}>
                <Text style={[styles.aiRole, message.role === 'client' && styles.aiRoleOnDark]}>{message.role === 'client' ? 'Client' : message.role === 'agent' ? 'Agent IA' : 'Système'}</Text>
                <Text style={[styles.aiMessageText, message.role === 'client' && styles.aiMessageTextOnDark]}>{message.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Messages automatiques</Text>
            {!clients.length ? <Text style={styles.empty}>Ajoutez des clients pour configurer les messages auto.</Text> : null}
            {clients.map((client: any) => (
              <View key={client.id} style={styles.autoClientRow}>
                <View style={styles.clientCardText}>
                  <Text style={styles.cardTitle}>{client.name || 'Client'}</Text>
                  <Text numberOfLines={2} style={styles.cardText}>{formatTemplate(client.autoMessage || autoSettings.welcomeMessage, client)}</Text>
                </View>
                <SecondaryButton label="Ouvrir" onPress={() => openClientMessage(client)} disabled={busy} />
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clients à relancer</Text>
            {clients.filter((client: any) => String(client.status || '').toLowerCase() === 'relancer').map((client: any) => (
              <View key={client.id} style={styles.autoClientRow}>
                <View style={styles.clientCardText}>
                  <Text style={styles.cardTitle}>{client.name || 'Client'}</Text>
                  <Text style={styles.cardText}>{client.phone || client.email || 'Coordonnées non renseignées'}</Text>
                </View>
                <SecondaryButton label="Message" onPress={() => openClientMessage(client)} disabled={busy} />
              </View>
            ))}
            {!clients.filter((client: any) => String(client.status || '').toLowerCase() === 'relancer').length ? <Text style={styles.empty}>Aucun client à relancer.</Text> : null}
          </View>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 82, gap: 0, backgroundColor: colors.background },
  businessHeader: { minHeight: 56, backgroundColor: colors.header, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  businessBack: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  businessHeaderText: { flex: 1, minWidth: 0 },
  businessHeaderTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  businessHeaderSubtitle: { color: 'rgba(255,255,255,0.70)', fontSize: 12, lineHeight: 14, fontWeight: '800', marginTop: 3 },
  businessAdd: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  businessTabsWrap: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  businessTab: { flex: 1, minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  businessTabActive: { backgroundColor: colors.header, borderColor: colors.header, shadowColor: '#102A2A', shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  businessTabText: { color: colors.secondary, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  businessTabTextActive: { color: '#FFFFFF' },
  businessIntro: { padding: 10, gap: 10 },
  aiHeroCard: { borderRadius: 16, backgroundColor: colors.header, borderWidth: 1, borderColor: 'rgba(217,183,91,0.34)', padding: 12, gap: 10, overflow: 'hidden', shadowColor: '#102A2A', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  aiHeroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  aiHeroBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D9B75B', alignItems: 'center', justifyContent: 'center' },
  aiHeroBadgeText: { color: colors.header, fontSize: 13, lineHeight: 16, fontWeight: '900' },
  aiHeroCopy: { flex: 1, minWidth: 0 },
  aiHeroPills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 5 },
  aiHeroPill: { overflow: 'hidden', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217,183,91,0.50)', backgroundColor: 'rgba(217,183,91,0.14)', color: '#F8E6A0', paddingHorizontal: 9, paddingVertical: 4, fontSize: 11.5, fontWeight: '900' },
  aiHeroMuted: { color: 'rgba(255,255,255,0.68)', fontSize: 11.5, fontWeight: '900' },
  aiHeroTitle: { color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  aiHeroText: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19, fontWeight: '800', marginTop: 8 },
  aiFeatureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aiFeature: { width: '48%', minHeight: 54, overflow: 'hidden', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.90)', paddingHorizontal: 9, paddingVertical: 8, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  aiHeroActions: { flexDirection: 'row', gap: 8 },
  goldButton: { flex: 1, minHeight: 38, borderRadius: 13, backgroundColor: '#D9B75B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  goldButtonText: { color: colors.header, fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  darkGhostButton: { flex: 1, minHeight: 38, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  darkGhostButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  subscriptionCard: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, padding: 12, gap: 10, shadowColor: '#102A2A', shadowOpacity: 0.07, shadowRadius: 13, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  subscriptionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  subscriptionBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  subscriptionBadgeText: { color: '#F8E6A0', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  subscriptionCopy: { flex: 1, minWidth: 0 },
  subscriptionTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  subscriptionTitleLink: { color: colors.header, textDecorationLine: 'underline' },
  subscriptionText: { color: colors.secondary, fontSize: 12.8, lineHeight: 18, fontWeight: '800', marginTop: 4 },
  priceBox: { minWidth: 86, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 7, alignItems: 'center' },
  priceValue: { color: colors.header, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  priceLabel: { color: colors.muted, fontSize: 10.5, lineHeight: 13, fontWeight: '900', marginTop: 2 },
  subscriptionActions: { flexDirection: 'row', gap: 8 },
  payButton: { flex: 1, minHeight: 42, borderRadius: 15, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  payButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  rechargeButton: { flex: 1, minHeight: 42, borderRadius: 15, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)' },
  rechargeButtonText: { color: colors.header, fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  disabledButton: { opacity: 0.54 },
  subscriptionFootnote: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  activationCard: { borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  activationTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  activationText: { color: colors.secondary, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  activationSteps: { gap: 8 },
  activationStep: { minHeight: 58, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  activationStepIndex: { width: 30, height: 30, overflow: 'hidden', borderRadius: 15, backgroundColor: colors.header, color: '#FFFFFF', textAlign: 'center', textAlignVertical: 'center', fontSize: 13, lineHeight: 30, fontWeight: '900' },
  activationStepCopy: { flex: 1, minWidth: 0 },
  activationStepTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  activationStepText: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '800', marginTop: 2 },
  previewCard: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 9, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  previewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  previewCopy: { flex: 1, minWidth: 0 },
  previewTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  previewText: { color: colors.muted, fontSize: 12.8, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  freeBadge: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#EAF4F1', color: colors.header, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11.5, fontWeight: '900' },
  previewActions: { flexDirection: 'row', gap: 7 },
  previewButton: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  previewButtonText: { color: colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  aiTestField: { minHeight: 72, textAlignVertical: 'top' },
  miniChat: { borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: 8 },
  accessCard: { borderRadius: 16, padding: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', gap: 9 },
  accessHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  accessIcon: { width: 38, height: 38, overflow: 'hidden', borderRadius: 13, backgroundColor: '#9A3412', color: '#FFFFFF', textAlign: 'center', textAlignVertical: 'center', fontSize: 20, lineHeight: 38, fontWeight: '900' },
  accessCopy: { flex: 1, minWidth: 0, gap: 6 },
  accessTitle: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  accessText: { color: '#9A3412', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  requirementList: { gap: 8 },
  requirementRow: { minHeight: 46, borderRadius: 14, backgroundColor: 'rgba(154,52,18,0.08)', borderWidth: 1, borderColor: 'rgba(154,52,18,0.14)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  requirementRowOk: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.12)' },
  requirementMark: { width: 24, color: colors.header, fontSize: 18, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  requirementText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14.5, lineHeight: 20, fontWeight: '900' },
  activeCard: { borderRadius: 18, padding: 14, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', gap: 10 },
  activeTitle: { color: colors.header, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  activeText: { color: colors.text, fontSize: 14.5, lineHeight: 21, fontWeight: '800' },
  startCard: { borderRadius: 16, backgroundColor: colors.header, padding: 12, gap: 9, shadowColor: '#102A2A', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  startTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  startText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  startActions: { flexDirection: 'row', gap: 8 },
  heroCopy: { color: colors.secondary, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  referenceStats: { flexDirection: 'row', gap: 10 },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolCard: { width: '48%', minHeight: 78, flexGrow: 1, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 11, justifyContent: 'center' },
  toolTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  toolText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 44, borderRadius: 14, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  largeTextarea: { minHeight: 132, textAlignVertical: 'top' },
  fieldLabel: { color: colors.secondary, fontSize: 12, lineHeight: 15, fontWeight: '900', marginTop: 6 },
  fieldColumn: { flex: 1, minWidth: 130, gap: 6 },
  reminderModeCard: { borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8 },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  flagCard: { width: '48%', minHeight: 82, flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
  flagCardActive: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.18)' },
  flagTitle: { color: colors.text, fontSize: 13, lineHeight: 16, fontWeight: '900' },
  flagTitleActive: { color: colors.header },
  flagText: { color: colors.muted, fontSize: 11.8, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  flagTextActive: { color: colors.secondary },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  hotClientCard: { backgroundColor: '#F0FFF0', borderColor: 'rgba(37,211,102,0.18)' },
  clientCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientCardText: { flex: 1, minWidth: 0 },
  statusBadge: { minHeight: 34, borderRadius: 17, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  statusBadgeSoft: { backgroundColor: '#DCEFEB' },
  statusBadgeText: { color: '#102A2A', fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 64, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 9, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  compactSegment: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, backgroundColor: colors.input, borderRadius: 14, padding: 4 },
  compactSegmentItem: { flexGrow: 1, minHeight: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1, minWidth: 130 },
  autoHero: { minHeight: 92, borderRadius: 18, backgroundColor: colors.header, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiBadge: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#D9B75B', alignItems: 'center', justifyContent: 'center' },
  aiBadgeText: { color: colors.header, fontSize: 14, fontWeight: '900' },
  autoHeroText: { flex: 1, minWidth: 0 },
  autoHeroTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  autoHeroSub: { color: 'rgba(255,255,255,0.74)', fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  automationStatusCard: { borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  automationStatusRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  automationStatusLabel: { flex: 1, color: colors.muted, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  automationStatusValue: { color: '#9A3412', fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  automationStatusOk: { color: colors.header },
  automationStatusText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  assetRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 9 },
  assetIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)' },
  assetIconText: { color: colors.header, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  assetCopy: { flex: 1, minWidth: 0 },
  aiMessage: { borderRadius: 14, padding: 10, gap: 4, marginTop: 8 },
  aiMessageClient: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.header },
  aiMessageAgent: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  aiMessageSystem: { alignSelf: 'stretch', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  aiRole: { color: colors.muted, fontSize: 10.5, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase' },
  aiRoleOnDark: { color: 'rgba(255,255,255,0.70)' },
  aiMessageText: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  aiMessageTextOnDark: { color: '#FFFFFF' },
  autoClientRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
});
