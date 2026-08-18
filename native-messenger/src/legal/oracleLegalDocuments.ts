export type LegalDocumentId = 'terms' | 'privacy' | 'data';

export type LegalSection = {
  id: string;
  title: string;
  body: string[];
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  shortTitle: string;
  subtitle: string;
  version: string;
  updatedAt: string;
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_CONTACT_EMAIL = 'contact@oracle-plus.online';
export const LEGAL_VERSION = '1.1';
export const LEGAL_UPDATED_AT = '15 aout 2026';

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: "Conditions d'utilisation",
    shortTitle: 'Conditions',
    subtitle: 'Regles applicables au compte, aux messages, aux appels, aux conferences, aux medias, aux paiements et aux outils IA.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Ces conditions expliquent comment utiliser Oracle Messenger de maniere responsable. Elles doivent etre lues avec la politique de confidentialite et la politique des donnees.",
    sections: [
      {
        id: 'service',
        title: '1. Service Oracle Messenger',
        body: [
          "Oracle Messenger est une application de messagerie et de communication permettant, selon les fonctions actives du compte, d'echanger des messages, fichiers, photos, videos, stories, reactions, statuts, appels audio, appels video, salles de conference, documents de conference, outils professionnels et services d'intelligence artificielle.",
          "Certaines fonctions sont gratuites, d'autres peuvent necessiter des credits, un paiement, un plan actif ou une autorisation particuliere. Le prix et les conditions d'acces doivent etre affiches avant paiement.",
        ],
      },
      {
        id: 'account',
        title: '2. Compte et identite',
        body: [
          "L'utilisateur doit utiliser son propre compte Google ou la methode d'authentification officiellement proposee par l'application. Il doit proteger son telephone, son compte, ses codes d'acces et sa session.",
          "Le nom et la photo affiches peuvent dependre du profil, du carnet d'adresses local du destinataire, des parametres de confidentialite et des donnees disponibles. Le serveur ne doit pas imposer automatiquement un nom de profil dans le carnet d'adresses d'un autre utilisateur.",
        ],
      },
      {
        id: 'acceptable-use',
        title: '3. Utilisation interdite',
        body: [
          "Il est interdit d'utiliser Oracle Messenger pour harceler, menacer, usurper une identite, diffuser des contenus illegaux, violents, frauduleux, discriminatoires, sexuels non consentis, portant atteinte aux droits d'autrui ou contraires aux lois applicables.",
          "Il est interdit de contourner les controles de paiement, d'automatiser abusivement le service, de perturber les serveurs, de tenter d'acceder a des comptes tiers ou d'extraire des donnees sans autorisation.",
        ],
      },
      {
        id: 'communications',
        title: '4. Messages, fichiers et medias',
        body: [
          "L'utilisateur reste responsable des messages, images, videos, fichiers, notes vocales, stories, reactions et informations qu'il cree ou partage.",
          "Oracle Messenger peut utiliser un fonctionnement local-first : l'interface affiche ce qui est deja disponible localement, puis synchronise avec le serveur lorsque le reseau est disponible.",
          "Les medias peuvent etre compresses, controles, transferes, mis en cache localement et temporairement traites par le serveur pour permettre la livraison, la sauvegarde locale sur les appareils concernes, les confirmations et la purge selon les regles techniques prevues.",
        ],
      },
      {
        id: 'calls-conferences',
        title: '5. Appels et conferences',
        body: [
          "Les appels audio/video et conferences utilisent le microphone, la camera, les notifications, la signalisation temps reel, WebRTC, LiveKit lorsque configure, ainsi que STUN/TURN lorsque necessaire pour traverser certains reseaux.",
          "L'utilisateur doit autoriser le microphone et la camera pour les fonctions qui en ont besoin. Sans permission, certaines fonctions d'appel ou de conference ne peuvent pas demarrer correctement.",
          "Les roles de conference peuvent inclure conferencier, participant, intervenant autorise, gestion des demandes de parole, questions, reactions, documents et cahier de conference.",
        ],
      },
      {
        id: 'ai-business',
        title: '6. IA, automatisation et services professionnels',
        body: [
          "Les outils IA peuvent aider a generer des reponses, images, videos, supports, syntheses, cahiers de conference ou contenus professionnels a partir des instructions fournies par l'utilisateur.",
          "L'utilisateur doit verifier les resultats produits par l'IA avant publication ou usage professionnel. Les contenus generes ne doivent pas etre presentes comme des conseils juridiques, medicaux, financiers ou techniques certifies sans validation par un professionnel competent.",
          "Les fonctions Business, CRM, diffusion ou automatisation doivent etre utilisees dans le respect des destinataires, des permissions, des lois anti-spam et des regles de protection des donnees.",
        ],
      },
      {
        id: 'payments',
        title: '7. Paiements, credits et documents payants',
        body: [
          "Les paiements sont verifies cote serveur. Un retour visuel depuis une page de paiement ne suffit pas a debloquer un service : la confirmation reelle du prestataire de paiement doit etre recue.",
          "Paystack peut etre utilise pour traiter les paiements. Oracle Messenger ne doit pas stocker les donnees completes de carte bancaire lorsque le paiement est gere par Paystack.",
          "Lorsqu'un cahier de conference ou un document est payant pour un participant, le document complet ne doit etre debloque qu'apres paiement confirme. Le conferencier peut beneficier de regles d'acces differentes selon la fonction.",
        ],
      },
      {
        id: 'availability',
        title: '8. Disponibilite et mises a jour',
        body: [
          "Oracle Messenger peut evoluer pour corriger des bugs, ameliorer la securite, la fluidite, le cache, les appels, les messages, les notifications ou la compatibilite Android.",
          "Certaines fonctions peuvent etre temporairement indisponibles en cas de maintenance, panne reseau, probleme fournisseur, ancienne version de l'application ou configuration serveur incomplete.",
          "L'application peut informer l'utilisateur qu'une mise a jour est necessaire lorsqu'une ancienne version n'est plus compatible avec les services actifs.",
        ],
      },
      {
        id: 'contact',
        title: '9. Contact',
        body: [
          `Pour toute question sur ces conditions, un probleme de compte, une demande liee aux donnees ou une reclamation, contactez Oracle Plus a ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Politique de confidentialite',
    shortTitle: 'Confidentialite',
    subtitle: 'Explication claire des donnees traitees, des permissions Android, des fournisseurs et des droits utilisateur.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Cette politique decrit les donnees necessaires au fonctionnement reel d'Oracle Messenger. Elle evite la promesse vague de zero stockage et distingue donnees locales, transit serveur, stockage temporaire et stockage durable.",
    sections: [
      {
        id: 'account-data',
        title: '1. Donnees de compte',
        body: [
          "Oracle Messenger peut traiter l'identifiant utilisateur, le nom, l'email Google, l'avatar, le numero de telephone lorsqu'il est renseigne, le nom d'utilisateur, la langue, les parametres, les sessions et les jetons necessaires a l'authentification.",
          "Ces donnees servent a ouvrir le compte, retrouver le bon utilisateur, afficher le profil, securiser la session, synchroniser les appareils et gerer les fonctions disponibles.",
        ],
      },
      {
        id: 'communications-data',
        title: '2. Donnees de communication',
        body: [
          "Les messages, groupes, conversations, identifiants de messages, accusés d'envoi, reception, lecture, reactions, typing, presence, stories et metadonnees de livraison peuvent etre traites pour livrer et synchroniser les conversations.",
          "Les medias et fichiers peuvent etre stockes localement sur les telephones, transferes par le serveur, caches temporairement, controles par autorisation et confirmes par accusé de sauvegarde locale lorsque la fonction le prevoit.",
          "Le serveur n'est pas presente comme un coffre personnel permanent pour les medias utilisateurs ; il reste cependant necessaire pour la livraison, la synchronisation, la securite, les files d'attente, les confirmations et certains historiques techniques.",
        ],
      },
      {
        id: 'contacts-data',
        title: '3. Contacts',
        body: [
          "L'application demande l'acces aux contacts Android uniquement lorsque l'utilisateur choisit d'importer ou synchroniser son carnet d'adresses.",
          "Les contacts servent a retrouver les utilisateurs deja inscrits, afficher un nom local choisi par le destinataire, inviter des contacts et eviter d'imposer le nom de profil d'une personne chez un autre utilisateur.",
          "Les donnees de contacts peuvent etre conservees localement et synchronisees sous forme necessaire au rapprochement, par exemple numeros normalises ou empreintes selon l'implementation serveur.",
        ],
      },
      {
        id: 'permissions',
        title: '4. Permissions Android',
        body: [
          "Internet et etat reseau servent a connecter l'application, detecter les coupures et synchroniser les donnees.",
          "Microphone, camera, audio et Bluetooth servent aux appels, notes vocales, videos, conferences, haut-parleur, ecouteur et appareils audio connectes.",
          "Notifications, vibration, wake lock et full-screen intent servent aux messages, appels entrants, sonneries, rappels importants et affichage d'appel lorsque le telephone est verrouille.",
          "Contacts sert a l'import volontaire du carnet d'adresses. L'application ne declare pas de permission Android de localisation precise dans la configuration auditee.",
        ],
      },
      {
        id: 'calls-data',
        title: '5. Appels audio/video',
        body: [
          "Pour etablir un appel, Oracle Messenger traite la signalisation, les identifiants d'appel, l'etat de disponibilite, les invitations, acceptations, refus, non-reponses et donnees techniques WebRTC.",
          "LiveKit peut etre utilise pour les appels de groupe, conferences ou SFU. STUN/TURN peut etre utilise pour permettre la connexion sur reseaux mobiles, NAT ou reseaux restrictifs.",
          "Sauf fonction d'enregistrement explicitement activee et annoncee, le flux audio/video est une communication temps reel ; des metadonnees techniques peuvent toutefois etre necessaires au diagnostic et a la qualite de service.",
        ],
      },
      {
        id: 'ai-data',
        title: '6. IA et automatisation',
        body: [
          "Les prompts, messages, images, videos, informations de conference, documents, demandes Business ou contenus transmis a un outil IA peuvent etre envoyes aux services IA configures par Oracle Messenger.",
          "Le backend contient des integrations vers des fournisseurs IA tels que Google Generative Language/Gemini et OpenAI selon les modules. Les donnees traitees dependent de la fonction demandee.",
          "L'utilisateur doit eviter de transmettre a l'IA des informations sensibles inutiles. Les resultats IA doivent etre verifies avant usage.",
        ],
      },
      {
        id: 'payments-third-parties',
        title: '7. Paiements et fournisseurs tiers',
        body: [
          "Paystack traite les paiements, references, montants, statuts et confirmations. Oracle Messenger conserve les informations necessaires pour verifier l'achat, eviter une double facturation et debloquer le service paye.",
          "Google intervient pour l'authentification. Firebase/Expo peuvent intervenir pour les notifications push. LiveKit, STUN/TURN, Socket.IO, Redis et l'infrastructure serveur interviennent pour le temps reel selon la configuration.",
          "Les fournisseurs tiers traitent les donnees necessaires a leur role technique ; leurs propres politiques peuvent s'appliquer a leur traitement.",
        ],
      },
      {
        id: 'security',
        title: '8. Securite',
        body: [
          "Les communications applicatives utilisent HTTPS/TLS lorsque l'application contacte l'API. Les WebSockets, jetons de session, permissions serveur et controles d'acces protegent les fonctions temps reel.",
          "Les jetons, sessions et identifiants techniques doivent etre controles cote serveur. Les sauvegardes Android de l'application sont desactivees dans la configuration auditee afin de reduire l'exposition de donnees locales.",
          "Aucune documentation publique ne doit divulguer de secrets, cles privees, identifiants TURN, cles Paystack ou cles IA.",
        ],
      },
      {
        id: 'rights',
        title: '9. Droits et controle utilisateur',
        body: [
          "L'utilisateur peut gerer les permissions Android depuis les reglages du telephone, supprimer des conversations localement selon les fonctions disponibles, se deconnecter, demander correction ou suppression de certaines donnees de compte.",
          `Pour exercer une demande relative aux donnees, contactez ${LEGAL_CONTACT_EMAIL} en indiquant le compte concerne et la demande exacte.`,
        ],
      },
    ],
  },
  data: {
    id: 'data',
    title: 'Politique des donnees',
    shortTitle: 'Donnees',
    subtitle: 'Chemin des donnees, stockage local, transit serveur, conservation, suppression et limites du zero storage.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Cette politique explique concretement ou vont les donnees : telephone, API, WebSocket, serveur, fournisseurs tiers et appareils destinataires.",
    sections: [
      {
        id: 'data-flow',
        title: '1. Chemin general des donnees',
        body: [
          "Pour un message typique : Telephone A -> interface -> stockage local/cache -> API ou WebSocket -> backend Oracle Messenger -> destinataire B -> stockage local/cache B -> interface B -> accusés de reception et lecture vers A.",
          "Pour un appel : Telephone A -> signalisation serveur -> notification/appel entrant B -> acceptation B -> connexion WebRTC/LiveKit/STUN/TURN selon reseau -> flux temps reel -> fin d'appel et metadonnees necessaires.",
          "Pour une conference : conferencier -> salle -> participants -> signalisation et etat de salle -> audio/video/documents/questions/reactions -> IA ou generation PDF lorsque la fonction est demandee.",
        ],
      },
      {
        id: 'zero-storage',
        title: '2. Realite du Zero Storage',
        body: [
          "Oracle Messenger peut viser une logique local-first ou zero storage pour certains medias personnels : l'objectif est que les contenus gardes par l'utilisateur soient principalement conserves sur son telephone.",
          "Cela ne signifie pas que le serveur ne traite jamais de donnees. Le serveur peut etre necessaire pour authentifier, router, livrer, mettre en file d'attente, notifier, synchroniser, generer un document, verifier un paiement ou purger un media apres confirmation.",
          "Les promesses de confidentialite doivent toujours distinguer : donnees locales, donnees en transit, donnees temporairement stockees, donnees durablement necessaires au compte et donnees traitees par des fournisseurs tiers.",
        ],
      },
      {
        id: 'local-storage',
        title: '3. Donnees stockees localement',
        body: [
          "Le telephone peut conserver messages caches, medias recus, medias envoyes, brouillons, preferences, contacts importes, fichiers telecharges, diagnostic local, etat de synchronisation et informations utiles a la fluidite.",
          "L'utilisateur doit conserver assez d'espace libre pour recevoir videos, images et fichiers. Si le telephone n'a plus d'espace, la sauvegarde locale, la lecture media ou la confirmation de livraison peuvent echouer.",
        ],
      },
      {
        id: 'server-storage',
        title: '4. Donnees traitees par le serveur',
        body: [
          "Le backend peut conserver les donnees de compte, sessions, relations, conversations, messages, statuts, accusés, stories, paiements, credits, conferences, documents, journaux techniques, tokens push et references necessaires au service.",
          "Les medias peuvent etre stockes dans un dossier serveur ou un service equivalent le temps de la livraison, de la verification, de la generation ou de la synchronisation. Ils doivent etre purges selon les regles techniques applicables lorsque la fonction impose une suppression apres livraison.",
        ],
      },
      {
        id: 'retention',
        title: '5. Conservation et suppression',
        body: [
          "Les donnees locales restent sur l'appareil tant que l'utilisateur ne les supprime pas, ne se deconnecte pas, ne vide pas le stockage de l'application ou ne desinstalle pas l'application.",
          "Les donnees serveur necessaires au compte, aux paiements, a la securite, aux conferences ou aux obligations legales peuvent etre conservees plus longtemps que les medias temporaires.",
          "Les documents de conference payes par un participant peuvent suivre une regle specifique : apres paiement, generation et telechargement, la copie serveur associee a ce participant peut etre supprimee si cette logique est activee cote backend.",
          "Une demande de suppression de compte ou de donnees doit etre adressee a l'equipe support. Certaines traces minimales peuvent rester temporairement pour securite, preuve de paiement, prevention de fraude ou obligations legales.",
        ],
      },
      {
        id: 'third-party-paths',
        title: '6. Services tiers et transferts',
        body: [
          "Google peut recevoir les donnees necessaires a la connexion. Firebase/Expo peuvent recevoir des jetons et donnees techniques de notification. Paystack recoit les donnees necessaires au paiement.",
          "LiveKit/STUN/TURN peuvent traiter les metadonnees et flux necessaires aux appels ou conferences. Les fournisseurs IA peuvent traiter les prompts, medias ou contenus necessaires aux generations demandees.",
          "Oracle Messenger doit limiter chaque transfert a ce qui est necessaire a la fonction demandee.",
        ],
      },
      {
        id: 'offline-cache',
        title: '7. Cache, hors connexion et mises a jour',
        body: [
          "Lorsque des donnees sont deja disponibles localement, l'application doit les afficher rapidement et synchroniser ensuite en arriere-plan.",
          "Les caches doivent etre invalides lorsqu'une nouvelle version, une nouvelle photo, un nouveau message, une mise a jour de presence ou une modification de document le necessite.",
          "Une ancienne version de l'application peut devoir etre mise a jour pour continuer a fonctionner avec les nouveaux services, permissions, schemas ou assets.",
        ],
      },
      {
        id: 'data-contact',
        title: '8. Contact donnees',
        body: [
          `Pour toute demande de consultation, correction, retrait de consentement, suppression ou information sur les donnees, contactez ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
};

export const LEGAL_DOCUMENT_LIST = [LEGAL_DOCUMENTS.terms, LEGAL_DOCUMENTS.privacy, LEGAL_DOCUMENTS.data];
