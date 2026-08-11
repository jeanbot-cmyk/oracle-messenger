import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { cancelLocalReminder, scheduleLocalReminder } from '@/services/notifications';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type ToolTab = 'meeting' | 'ai' | 'flyer' | 'video' | 'translate' | 'notes' | 'events';
type LocalNote = { id: string; title: string; body: string; updatedAt: number };
type LocalEvent = { id: string; title: string; date: string; time: string; note: string; createdAt: number; notificationId?: string };
type AiMessage = { id: string; from: 'client' | 'agent'; text: string };
type QuickTool = { mode: ToolTab; title: string; subtitle: string };
type GeneratedCreation = { id: string; type: 'flyer' | 'video'; url: string; prompt: string; createdAt: number };

const DEFAULT_AI_PROMPT = 'Tu es l’assistant commercial de mon entreprise. Réponds clairement et poliment.';

const QUICK_TOOLS: QuickTool[] = [
  { mode: 'flyer', title: 'Créer IA Image', subtitle: 'Flyers et affiches' },
  { mode: 'video', title: 'IA Vidéo', subtitle: 'Vidéos de présentation' },
  { mode: 'translate', title: 'Traduction', subtitle: 'Messages multilingues' },
  { mode: 'ai', title: 'Réponse IA', subtitle: 'Texte professionnel' },
];

const AI_DELAY_OPTIONS = [
  { value: 0, label: 'Immédiat' },
  { value: 1000, label: '1 s' },
  { value: 5000, label: '5 s' },
  { value: 10000, label: '10 s' },
  { value: 30000, label: '30 s' },
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
  { value: 300000, label: '5 min' },
  { value: -1, label: 'Perso' },
] as const;

const AI_SCOPE_OPTIONS = [
  { value: 'private_only', label: 'Privées' },
  { value: 'groups_only', label: 'Groupes' },
  { value: 'friends', label: 'Amis' },
  { value: 'non_friends', label: 'Non amis' },
  { value: 'everyone', label: 'Tous' },
] as const;

function ownerKey(base: string, ownerId: string) {
  return `${base}:${ownerId || 'local'}`;
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function parseReminderDate(date: string, time: string) {
  const cleanDate = date.trim();
  if (!cleanDate) return null;
  const cleanTime = time.trim() || '09:00';
  const candidate = cleanDate.includes('T') ? cleanDate : `${cleanDate}T${cleanTime}:00`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{valueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MeetingTool({ userName }: { userName: string }) {
  const [room, setRoom] = useState('');
  const [notice, setNotice] = useState('');

  const roomName = room.trim() || `oracle-${userName.replace(/\W+/g, '-').toLowerCase() || 'meeting'}`;
  const link = `https://meet.jit.si/${encodeURIComponent(roomName)}`;

  const openMeeting = useCallback(async () => {
    try {
      await Linking.openURL(`${link}#userInfo.displayName="${encodeURIComponent(userName)}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture Meeting impossible.');
    }
  }, [link, userName]);

  const shareMeeting = useCallback(async () => {
    try {
      await Share.share({ message: link });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage Meeting impossible.');
    }
  }, [link]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Créez ou rejoignez une salle Meeting avec un lien partageable.</Text>
      <TextInput value={room} onChangeText={setRoom} placeholder="Nom de salle ou lien" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.actionRow}>
        <PrimaryButton label="Ouvrir Meeting" onPress={openMeeting} />
        <SecondaryButton label="Partager" onPress={shareMeeting} />
      </View>
      <Text style={styles.cardMeta}>{link}</Text>
      <AlertText text={notice} />
    </View>
  );
}

function TranslateTool({ token }: { token: string }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('fr');
  const [result, setResult] = useState('');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const translate = useCallback(async () => {
    const text = source.trim();
    if (!text) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await api.aiAutoTranslate(token, text, target.trim() || 'fr');
      setResult(data.translated);
      setProvider(data.provider);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Traduction impossible.');
    } finally {
      setBusy(false);
    }
  }, [source, target, token]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Traduction reliée au backend IA avec code langue cible.</Text>
      <TextInput value={target} onChangeText={setTarget} placeholder="Langue cible: fr, en, es..." placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={source} onChangeText={setSource} placeholder="Texte à traduire" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Traduire" onPress={translate} disabled={busy || !source.trim()} />
      <Loading active={busy} />
      <AlertText text={notice} />
      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Résultat</Text>
          <Text style={styles.cardText}>{result}</Text>
          <Text style={styles.cardMeta}>{provider ? `Provider: ${provider}` : ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NotesTool({ ownerId }: { ownerId: string }) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const storageKey = useMemo(() => ownerKey('oracle-native-notes', ownerId), [ownerId]);

  const persist = useCallback(async (next: LocalNote[]) => {
    setNotes(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive) return;
        setNotes(raw ? JSON.parse(raw) : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [storageKey]);

  const save = useCallback(async () => {
    if (!title.trim() && !body.trim()) return;
    const note: LocalNote = { id: `${Date.now()}`, title: title.trim() || 'Note', body: body.trim(), updatedAt: Date.now() };
    await persist([note, ...notes].slice(0, 120));
    setTitle('');
    setBody('');
  }, [body, notes, persist, title]);

  const remove = useCallback(async (id: string) => {
    await persist(notes.filter(note => note.id !== id));
  }, [notes, persist]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Notes locales isolées par compte, conservées après redémarrage de l’application.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Titre" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={body} onChangeText={setBody} placeholder="Note" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Enregistrer la note" onPress={save} disabled={!title.trim() && !body.trim()} />
      {notes.map(note => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.cardTitle}>{note.title}</Text>
          <Text style={styles.cardText}>{note.body}</Text>
          <Text style={styles.cardMeta}>{new Date(note.updatedAt).toLocaleString('fr-FR')}</Text>
          <SecondaryButton label="Supprimer" onPress={() => remove(note.id)} />
        </View>
      ))}
    </View>
  );
}

function EventsTool({ ownerId }: { ownerId: string }) {
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const storageKey = useMemo(() => ownerKey('oracle-native-events', ownerId), [ownerId]);

  const persist = useCallback(async (next: LocalEvent[]) => {
    setEvents(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        setEvents(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [storageKey]);

  const save = useCallback(async () => {
    if (!title.trim() || !date.trim()) return;
    const scheduledAt = parseReminderDate(date, time);
    let notificationId = '';
    if (scheduledAt && scheduledAt.getTime() > Date.now()) {
      notificationId = await scheduleLocalReminder({
        title: title.trim(),
        body: note.trim() || 'Rappel Oracle Messenger',
        date: scheduledAt,
      });
    }
    const event: LocalEvent = { id: `${Date.now()}`, title: title.trim(), date: date.trim(), time: time.trim() || '09:00', note: note.trim(), createdAt: Date.now(), notificationId };
    await persist([event, ...events].slice(0, 120));
    setTitle('');
    setDate('');
    setTime('09:00');
    setNote('');
  }, [date, events, note, persist, time, title]);

  const remove = useCallback(async (event: LocalEvent) => {
    await cancelLocalReminder(event.notificationId);
    await persist(events.filter(item => item.id !== event.id));
  }, [events, persist]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Rappels locaux conservés par compte avec notification native lorsque la date est future.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Titre du rappel" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.actionRow}>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
        <TextInput value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Détail" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Enregistrer le rappel" onPress={save} disabled={!title.trim() || !date.trim()} />
      {events.map(event => (
        <View key={event.id} style={styles.card}>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardText}>{event.note || 'Sans détail'}</Text>
          <Text style={styles.cardMeta}>{event.date} à {event.time}{event.notificationId ? ' • notification planifiée' : ''}</Text>
          <SecondaryButton label="Supprimer" onPress={() => remove(event)} />
        </View>
      ))}
    </View>
  );
}

export function ToolsPage({ token, ownerId, userName, initialMode = 'meeting' }: { token: string; ownerId: string; userName: string; initialMode?: ToolTab }) {
  const [mode, setMode] = useState<ToolTab>(initialMode);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [aiConfigPrompt, setAiConfigPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiDelayMs, setAiDelayMs] = useState(5000);
  const [aiCustomDelaySeconds, setAiCustomDelaySeconds] = useState('');
  const [aiRecipientScope, setAiRecipientScope] = useState('private_only');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<10 | 45>(10);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [videoQuality, setVideoQuality] = useState<'hd' | 'full_hd' | 'ultra'>('hd');
  const [videoVoiceOver, setVideoVoiceOver] = useState(true);
  const [videoMusic, setVideoMusic] = useState(true);
  const [videoSoundEffects, setVideoSoundEffects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [creations, setCreations] = useState<GeneratedCreation[]>([]);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creationsStorageKey = useMemo(() => ownerKey('oracle-native-ai-creations', ownerId), [ownerId]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const load = useCallback(async () => {
    if (mode !== 'ai' && mode !== 'flyer' && mode !== 'video') {
      setOverview(null);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const data = mode === 'ai'
        ? await api.aiAutoOverview(token)
        : mode === 'flyer'
          ? await api.aiFlyerOverview(token)
          : await api.aiVideoOverview(token);
      setOverview(data);
      if (mode === 'ai') {
        const config = data?.config || {};
        setAiConfigPrompt(config.prompt || DEFAULT_AI_PROMPT);
        setAiDelayMs(Number(config.delayMs ?? 5000));
        setAiRecipientScope(config.recipientScope || 'private_only');
        setAiEnabled(Boolean(config.isEnabled));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Outils indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [mode, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(creationsStorageKey)
      .then(raw => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        setCreations(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [creationsStorageKey]);

  const persistCreations = useCallback(async (next: GeneratedCreation[]) => {
    const limited = next.slice(0, 80);
    setCreations(limited);
    await AsyncStorage.setItem(creationsStorageKey, JSON.stringify(limited));
  }, [creationsStorageKey]);

  const saveCreation = useCallback(async (creation: GeneratedCreation) => {
    await persistCreations([creation, ...creations]);
  }, [creations, persistCreations]);

  const armAutoClose = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      setAiOpen(false);
      setNotice('Test IA fermé après 45 secondes d’inactivité.');
    }, 45000);
  }, []);

  const saveAiConfig = useCallback(async (nextEnabled = aiEnabled, silent = false) => {
    setBusy(true);
    if (!silent) setNotice('');
    try {
      const selectedDelay = aiDelayMs === -1 ? Math.max(0, Number(aiCustomDelaySeconds || 0) * 1000) : aiDelayMs;
      const limitedPrompt = aiConfigPrompt.trim().split(/\s+/).filter(Boolean).slice(0, 80).join(' ') || DEFAULT_AI_PROMPT;
      const data = await api.aiAutoSaveConfig(token, {
        prompt: limitedPrompt,
        delayMs: selectedDelay,
        recipientScope: aiRecipientScope,
        isEnabled: nextEnabled,
        dailyLimit: null,
      });
      setAiConfigPrompt(limitedPrompt);
      setAiEnabled(nextEnabled);
      setOverview(data?.overview || data);
      if (!silent) setNotice(data?.blocked || 'Configuration IA enregistrée.');
      await load();
    } catch (error) {
      if (!silent) setNotice(error instanceof Error ? error.message : 'Enregistrement IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [aiConfigPrompt, aiCustomDelaySeconds, aiDelayMs, aiEnabled, aiRecipientScope, load, token]);

  useEffect(() => () => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
  }, []);

  const testAi = useCallback(async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setNotice('');
    setAiOpen(true);
    const clientText = prompt.trim();
    setAiMessages(current => [...current, { id: `c-${Date.now()}`, from: 'client', text: clientText }]);
    setPrompt('');
    armAutoClose();
    try {
      await saveAiConfig(false, true);
      const data = await api.aiAutoTest(token, clientText, 'tools');
      setAiMessages(current => [...current, { id: `a-${Date.now()}`, from: 'agent', text: data.response }]);
      if (data.freeTestsRemainingToday === 0) {
        setAiOpen(false);
        setNotice('Tests gratuits terminés pour aujourd’hui.');
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Test IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [armAutoClose, load, prompt, saveAiConfig, token]);

  const generateFlyer = useCallback(async () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    setBusy(true);
    try {
      const data = await api.aiFlyerGenerate(token, currentPrompt);
      const url = data?.imageUrl || data?.url || data?.assetUrl || '';
      if (url) {
        await saveCreation({ id: `flyer-${Date.now()}`, type: 'flyer', url, prompt: currentPrompt, createdAt: Date.now() });
      }
      setNotice(url ? 'Flyer généré et enregistré dans vos créations.' : 'Flyer généré.');
      setPrompt('');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération flyer impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, prompt, saveCreation, token]);

  const generateVideo = useCallback(async () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    setBusy(true);
    try {
      const data = await api.aiVideoGenerate(token, {
        prompt: currentPrompt,
        durationSeconds: videoDurationSeconds,
        aspectRatio: videoAspectRatio,
        quality: videoQuality,
        voiceOver: videoVoiceOver,
        music: videoMusic,
        soundEffects: videoSoundEffects,
      });
      const url = data?.videoUrl || data?.url || data?.assetUrl || '';
      if (url) {
        await saveCreation({ id: `video-${Date.now()}`, type: 'video', url, prompt: currentPrompt, createdAt: Date.now() });
      }
      setNotice(url ? 'Vidéo générée et enregistrée dans vos créations.' : 'Vidéo demandée.');
      setPrompt('');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération vidéo impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, prompt, saveCreation, token, videoAspectRatio, videoDurationSeconds, videoMusic, videoQuality, videoSoundEffects, videoVoiceOver]);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = mode === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'activation_1500')
        : mode === 'flyer'
          ? await api.aiFlyerInitializePaystack(token)
          : await api.aiVideoInitializePaystack(token);
      await Linking.openURL(data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement indisponible.');
    } finally {
      setBusy(false);
    }
  }, [mode, token]);

  const openOracleWeb = useCallback(() => {
    Linking.openURL('https://web.oracle-plus.online?source=messenger-native-tools').catch(() => setNotice('Ouverture Oracle Web impossible.'));
  }, []);

  const openSpirituality = useCallback(() => {
    Linking.openURL('https://oracle-plus.online/consultation').catch(() => setNotice('Ouverture Spiritualité impossible.'));
  }, []);

  const shareMessenger = useCallback(async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: 'Oracle Messenger: https://messenger.oracle-plus.online',
    });
  }, []);

  const openCreation = useCallback((creation: GeneratedCreation) => {
    Linking.openURL(creation.url).catch(() => setNotice('Ouverture de la création impossible.'));
  }, []);

  const shareCreation = useCallback(async (creation: GeneratedCreation) => {
    await Share.share({ title: creation.type === 'flyer' ? 'Flyer Oracle IA' : 'Vidéo Oracle IA', message: creation.url, url: creation.url });
  }, []);

  const deleteCreation = useCallback(async (creationId: string) => {
    await persistCreations(creations.filter(item => item.id !== creationId));
  }, [creations, persistCreations]);

  const aiPromptWordCount = aiConfigPrompt.trim() ? aiConfigPrompt.trim().split(/\s+/).filter(Boolean).length : 0;
  const canEnableAi = Boolean(overview?.config?.paidActive && Number(overview?.wallet?.wordsRemaining ?? 0) > 0);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader title="Outils" />
      <Section title="Créer plus vite avec Oracle">
        <Text style={styles.heroCopy}>Des modules utiles pour communiquer et vendre.</Text>
        <View style={styles.quickGrid}>
          {QUICK_TOOLS.map(tool => (
            <Pressable key={tool.mode} onPress={() => setMode(tool.mode)} style={[styles.quickCard, mode === tool.mode && styles.quickCardActive]}>
              <View style={styles.quickIcon}><Text style={styles.quickIconText}>IA</Text></View>
              <Text style={styles.quickTitle}>{tool.title}</Text>
              <Text style={styles.quickSubtitle}>{tool.subtitle}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.assistantCard}>
          <Text style={styles.assistantTitle}>Assistant dans le chat</Text>
          <Text style={styles.assistantCopy}>Rédige, corrige et adapte vos messages.</Text>
          <Pressable onPress={() => setMode('ai')} style={styles.greenButton}>
            <Text style={styles.greenButtonText}>Tester maintenant</Text>
          </Pressable>
        </View>
      </Section>
      <Section title="Outils">
        <Text style={styles.pageCopy}>Meeting, IA, flyers, vidéos, traduction, notes et rappels restaurés en écrans natifs reliés aux services disponibles.</Text>
        <View style={styles.segment}>
          {(['meeting', 'ai', 'flyer', 'video', 'translate', 'notes', 'events'] as const).map(item => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.segmentItem, mode === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>
                {item === 'meeting' ? 'Meeting' : item === 'ai' ? 'IA' : item === 'flyer' ? 'Flyer' : item === 'video' ? 'Vidéo' : item === 'translate' ? 'Traduire' : item === 'notes' ? 'Notes' : 'Rappels'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionRow}>
          <SecondaryButton label="Oracle Web" onPress={openOracleWeb} />
          <SecondaryButton label="Spiritualité" onPress={openSpirituality} />
          <SecondaryButton label="Partager l’app" onPress={shareMessenger} />
        </View>
        {mode === 'meeting' ? <MeetingTool userName={userName} /> : null}
        {mode === 'translate' ? <TranslateTool token={token} /> : null}
        {mode === 'notes' ? <NotesTool ownerId={ownerId} /> : null}
        {mode === 'events' ? <EventsTool ownerId={ownerId} /> : null}
        {mode === 'ai' || mode === 'flyer' || mode === 'video' ? (
          <View style={styles.subPanel}>
            <View style={styles.statsGrid}>
              <Stat label="Crédits" value={overview?.credits ?? overview?.wordsBalance ?? overview?.remaining ?? overview?.wallet?.creditsRemaining ?? overview?.wallet?.wordsRemaining ?? 0} />
              <Stat label="Paystack" value={overview?.paystackReady ? 'Prêt' : 'Bloqué'} />
              <Stat label="Gratuit" value={overview?.freeTestsRemainingToday ?? overview?.freeRemaining ?? overview?.free?.remaining ?? '-'} />
              <Stat label="Statut" value={overview?.access?.active || overview?.paidActive || overview?.config?.paidActive ? 'Premium' : 'Standard'} />
            </View>
            {mode === 'ai' ? (
              <View style={styles.configBox}>
                <View style={styles.cardHeadRow}>
                  <Text style={styles.cardTitle}>Gemini Auto-Réponse Premium</Text>
                  <Text style={[styles.cardMeta, aiPromptWordCount > 80 && styles.dangerText]}>{aiPromptWordCount}/80 mots</Text>
                </View>
                <Text style={styles.cardText}>Configure l’agent automatique avant activation. Le test reste privé et n’envoie rien sans validation.</Text>
                <TextInput
                  value={aiConfigPrompt}
                  onChangeText={text => setAiConfigPrompt(text.trim().split(/\s+/).filter(Boolean).length > 80 ? text.trim().split(/\s+/).filter(Boolean).slice(0, 80).join(' ') : text)}
                  placeholder="Prompt principal privé"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={[styles.input, styles.textarea]}
                />
                <Text style={styles.cardMeta}>Délai</Text>
                <View style={styles.segment}>
                  {AI_DELAY_OPTIONS.map(option => (
                    <Pressable key={option.value} onPress={() => setAiDelayMs(option.value)} style={[styles.segmentItem, aiDelayMs === option.value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, aiDelayMs === option.value && styles.segmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {aiDelayMs === -1 ? (
                  <TextInput value={aiCustomDelaySeconds} onChangeText={setAiCustomDelaySeconds} placeholder="Délai personnalisé en secondes" placeholderTextColor={colors.muted} keyboardType="numeric" style={styles.input} />
                ) : null}
                <Text style={styles.cardMeta}>Destinataires</Text>
                <View style={styles.segment}>
                  {AI_SCOPE_OPTIONS.map(option => (
                    <Pressable key={option.value} onPress={() => setAiRecipientScope(option.value)} style={[styles.segmentItem, aiRecipientScope === option.value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, aiRecipientScope === option.value && styles.segmentTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {!overview?.paystackReady ? <AlertText text="Paystack n’est pas configuré côté serveur. Les paiements réels restent bloqués." /> : null}
                {!overview?.geminiReady ? <AlertText text="Clé Gemini absente ou indisponible côté serveur : mode IA limité." /> : null}
                <View style={styles.actionRow}>
                  <SecondaryButton label="Enregistrer les réglages" onPress={() => saveAiConfig(aiEnabled)} disabled={busy} />
                  <SecondaryButton label={aiEnabled ? 'Désactiver' : 'Activer'} onPress={() => saveAiConfig(!aiEnabled)} disabled={busy || (!aiEnabled && !canEnableAi)} />
                </View>
              </View>
            ) : null}
            {mode === 'video' ? (
              <View style={styles.configBox}>
                <Text style={styles.cardTitle}>Réglages vidéo IA</Text>
                <Text style={styles.cardText}>Options alignées sur Capacitor : durée, format, qualité, voix off, musique et effets.</Text>
                <View style={styles.segment}>
                  {([10, 45] as const).map(value => (
                    <Pressable key={value} onPress={() => setVideoDurationSeconds(value)} style={[styles.segmentItem, videoDurationSeconds === value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, videoDurationSeconds === value && styles.segmentTextActive]}>{value === 10 ? 'Test 10s' : 'Premium 45s'}</Text>
                    </Pressable>
                  ))}
                  {(['9:16', '16:9'] as const).map(value => (
                    <Pressable key={value} onPress={() => setVideoAspectRatio(value)} style={[styles.segmentItem, videoAspectRatio === value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, videoAspectRatio === value && styles.segmentTextActive]}>{value}</Text>
                    </Pressable>
                  ))}
                  {(['hd', 'full_hd', 'ultra'] as const).map(value => (
                    <Pressable key={value} onPress={() => setVideoQuality(value)} style={[styles.segmentItem, videoQuality === value && styles.segmentActive]}>
                      <Text style={[styles.segmentText, videoQuality === value && styles.segmentTextActive]}>{value === 'hd' ? 'HD' : value === 'full_hd' ? 'Full HD' : 'Très HD'}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setVideoVoiceOver(current => !current)} style={[styles.segmentItem, videoVoiceOver && styles.segmentActive]}>
                    <Text style={[styles.segmentText, videoVoiceOver && styles.segmentTextActive]}>Voix off</Text>
                  </Pressable>
                  <Pressable onPress={() => setVideoMusic(current => !current)} style={[styles.segmentItem, videoMusic && styles.segmentActive]}>
                    <Text style={[styles.segmentText, videoMusic && styles.segmentTextActive]}>Musique</Text>
                  </Pressable>
                  <Pressable onPress={() => setVideoSoundEffects(current => !current)} style={[styles.segmentItem, videoSoundEffects && styles.segmentActive]}>
                    <Text style={[styles.segmentText, videoSoundEffects && styles.segmentTextActive]}>Effets</Text>
                  </Pressable>
                </View>
                {videoDurationSeconds === 45 ? <AlertText text="La vidéo Premium 45 secondes nécessite une validation Paystack côté serveur." /> : null}
              </View>
            ) : null}
            <TextInput
              value={prompt}
              onChangeText={text => { setPrompt(text); if (aiOpen) armAutoClose(); }}
              placeholder={mode === 'ai' ? 'Message client pour tester l’agent IA' : mode === 'flyer' ? 'Instruction du flyer à créer' : 'Instruction de la vidéo à créer'}
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            {mode === 'ai' ? <PrimaryButton label="Tester l’agent IA" onPress={testAi} disabled={busy || !prompt.trim()} /> : null}
            {mode === 'flyer' ? <PrimaryButton label="Créer le flyer" onPress={generateFlyer} disabled={busy || !prompt.trim()} /> : null}
            {mode === 'video' ? <PrimaryButton label="Créer la vidéo" onPress={generateVideo} disabled={busy || !prompt.trim()} /> : null}
            <SecondaryButton label={mode === 'video' ? 'Payer / activer video' : mode === 'flyer' ? 'Payer / activer les flyers' : 'Acheter credits IA'} onPress={pay} disabled={busy || overview?.paystackReady === false} />
            {overview?.paystackReady === false ? <AlertText text="Paiement non disponible : Paystack n’est pas configuré côté serveur." /> : null}
            <Loading active={busy} />
            <AlertText text={notice} />
            {aiOpen ? (
              <View style={styles.chatPanel}>
                <Text style={styles.cardTitle}>Test IA</Text>
                {aiMessages.map(message => (
                  <View key={message.id} style={[styles.aiBubble, message.from === 'client' ? styles.aiClient : styles.aiAgent]}>
                    <Text style={styles.aiFrom}>{message.from === 'client' ? 'Client' : 'Agent IA'}</Text>
                    <Text style={styles.aiText}>{message.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {mode === 'flyer' || mode === 'video' ? (
              <View style={styles.configBox}>
                <Text style={styles.cardTitle}>Créations enregistrées</Text>
                {!creations.filter(item => item.type === mode).length ? <Text style={styles.cardMeta}>Aucune création locale pour ce module.</Text> : null}
                {creations.filter(item => item.type === mode).map(creation => (
                  <View key={creation.id} style={styles.creationRow}>
                    <View style={styles.creationCopy}>
                      <Text numberOfLines={1} style={styles.cardTitle}>{creation.type === 'flyer' ? 'Flyer IA' : 'Vidéo IA'}</Text>
                      <Text numberOfLines={2} style={styles.cardText}>{creation.prompt}</Text>
                      <Text style={styles.cardMeta}>{new Date(creation.createdAt).toLocaleString('fr-FR')}</Text>
                    </View>
                    <View style={styles.creationActions}>
                      <SecondaryButton label="Ouvrir" onPress={() => openCreation(creation)} />
                      <SecondaryButton label="Partager" onPress={() => shareCreation(creation)} />
                      <SecondaryButton label="Suppr." onPress={() => deleteCreation(creation.id)} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  heroCopy: { color: colors.secondary, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: { width: '48%', minWidth: 142, flexGrow: 1, minHeight: 142, borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: 18, justifyContent: 'center' },
  quickCardActive: { borderColor: colors.header, backgroundColor: '#F8FFFA' },
  quickIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  quickIconText: { color: '#FFFFFF', fontSize: 16, lineHeight: 19, fontWeight: '900' },
  quickTitle: { color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  quickSubtitle: { color: colors.secondary, fontSize: 13.5, lineHeight: 18, fontWeight: '900', marginTop: 8 },
  assistantCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: 20, gap: 10 },
  assistantTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  assistantCopy: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  greenButton: { alignSelf: 'flex-start', minHeight: 46, minWidth: 190, borderRadius: 23, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 8 },
  greenButtonText: { color: '#102A2A', fontSize: 14, fontWeight: '900' },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 74, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  subPanel: { gap: 10 },
  configBox: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1, minWidth: 130 },
  dangerText: { color: colors.danger },
  chatPanel: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  aiBubble: { maxWidth: '92%', borderRadius: 16, padding: 10, gap: 4 },
  aiClient: { alignSelf: 'flex-end', backgroundColor: '#DCFCE7' },
  aiAgent: { alignSelf: 'flex-start', backgroundColor: '#EAF4F1' },
  aiFrom: { color: colors.muted, fontSize: 10.5, fontWeight: '900' },
  aiText: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  creationRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
  creationCopy: { gap: 3 },
  creationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
