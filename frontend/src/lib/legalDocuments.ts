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
    subtitle: 'Compte, messagerie, appels, conferences, medias, paiements, IA et responsabilites utilisateur.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Oracle Messenger est une application de communication. Ces conditions encadrent son usage et doivent etre lues avec la politique de confidentialite et la politique des donnees.",
    sections: [
      {
        id: 'service',
        title: '1. Service Oracle Messenger',
        body: [
          "Oracle Messenger permet, selon les fonctions actives, d'utiliser messagerie instantanee, fichiers, photos, videos, stories, reactions, presence, appels audio/video, groupes, salles de conference, documents de conference, outils professionnels, paiements et services IA.",
          "Certaines fonctions peuvent etre gratuites, payantes, limitees par credits ou reservees a un plan. Le prix et les conditions doivent etre presentes avant paiement.",
        ],
      },
      {
        id: 'account',
        title: '2. Compte et identite',
        body: [
          "L'utilisateur doit utiliser son propre compte et proteger son telephone, sa session, son compte Google et ses moyens d'acces.",
          "Le nom affiche chez un autre utilisateur peut dependre de son carnet d'adresses local. Oracle Messenger ne doit pas imposer automatiquement le nom de profil d'une personne dans le carnet d'adresses d'un autre utilisateur.",
        ],
      },
      {
        id: 'acceptable-use',
        title: '3. Utilisations interdites',
        body: [
          "Il est interdit de harceler, menacer, usurper une identite, diffuser des contenus illegaux, frauduleux, discriminatoires, sexuels non consentis ou portant atteinte aux droits d'autrui.",
          "Il est interdit de contourner les paiements, d'attaquer les serveurs, d'extraire des donnees sans autorisation, d'automatiser abusivement le service ou de perturber les conversations et conferences.",
        ],
      },
      {
        id: 'communications',
        title: '4. Messages, medias et stockage',
        body: [
          "L'utilisateur reste responsable des messages, images, videos, fichiers, notes vocales, stories, reactions et informations qu'il partage.",
          "L'application peut fonctionner en local-first : les donnees disponibles localement s'affichent rapidement, puis la synchronisation serveur continue en arriere-plan.",
          "Les medias peuvent etre compresses, transferes, caches localement, traites temporairement par le serveur, confirmes par accusé de sauvegarde locale puis purges selon les regles techniques prevues.",
        ],
      },
      {
        id: 'calls-conference',
        title: '5. Appels et conferences',
        body: [
          "Les appels audio/video et conferences utilisent micro, camera, notifications, signalisation temps reel, WebRTC, LiveKit lorsque configure, et STUN/TURN lorsque le reseau l'exige.",
          "La conference peut inclure conferencier, participants, demandes de parole, autorisation micro, questions, reactions, documents, synthese IA et generation de cahier PDF.",
        ],
      },
      {
        id: 'ai',
        title: '6. IA et services professionnels',
        body: [
          "Les outils IA peuvent produire reponses, images, videos, supports, syntheses, cahiers de conference ou contenus professionnels a partir des donnees fournies par l'utilisateur.",
          "Les resultats IA doivent etre verifies. Ils ne remplacent pas un conseil professionnel juridique, medical, financier ou technique.",
        ],
      },
      {
        id: 'payments',
        title: '7. Paiements',
        body: [
          "Les paiements, credits, documents payants et plans sont verifies cote serveur. Le deblocage d'un service necessite une confirmation reelle du prestataire de paiement.",
          "Paystack peut traiter les paiements. Oracle Messenger ne doit pas stocker les donnees completes de carte bancaire lorsque le paiement est gere par Paystack.",
        ],
      },
      {
        id: 'changes-contact',
        title: '8. Evolution et contact',
        body: [
          "Oracle Messenger peut evoluer pour corriger des bugs, ameliorer les appels, la messagerie, la securite, le cache, les notifications et la compatibilite Android.",
          `Pour toute question, contactez ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Politique de confidentialite',
    shortTitle: 'Confidentialite',
    subtitle: 'Donnees traitees, permissions, fournisseurs, securite et droits utilisateur.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Cette politique explique les donnees necessaires au fonctionnement reel d'Oracle Messenger, sans promettre un zero stockage general qui serait techniquement inexact.",
    sections: [
      {
        id: 'account-data',
        title: '1. Donnees de compte',
        body: [
          "Oracle Messenger peut traiter identifiant utilisateur, nom, email Google, avatar, numero de telephone lorsqu'il est renseigne, nom d'utilisateur, langue, parametres, sessions et jetons d'authentification.",
          "Ces donnees servent a ouvrir le compte, proteger la session, retrouver le bon utilisateur, afficher le profil, synchroniser les appareils et activer les fonctions autorisees.",
        ],
      },
      {
        id: 'communication-data',
        title: '2. Donnees de communication',
        body: [
          "Messages, conversations, groupes, identifiants, accusés, reactions, typing, presence, stories, medias et metadonnees de livraison peuvent etre traites pour livrer et synchroniser les conversations.",
          "Les medias peuvent etre stockes localement sur les telephones, transferes par le serveur, caches temporairement, controles par autorisation et confirmes par accusé de sauvegarde locale.",
        ],
      },
      {
        id: 'contacts',
        title: '3. Contacts',
        body: [
          "L'acces aux contacts Android est demande lorsque l'utilisateur choisit l'import ou la synchronisation de son carnet d'adresses.",
          "Les contacts servent a identifier les utilisateurs deja inscrits, afficher le nom choisi localement par le destinataire, inviter des contacts et eviter les doublons.",
        ],
      },
      {
        id: 'permissions',
        title: '4. Permissions Android',
        body: [
          "Internet et etat reseau servent a connecter et synchroniser l'application. Microphone, camera, audio et Bluetooth servent aux appels, notes vocales et conferences.",
          "Notifications, vibration, wake lock et full-screen intent servent aux messages, appels entrants et alertes importantes. Contacts sert a l'import volontaire du carnet d'adresses.",
          "La configuration auditee ne declare pas de permission Android de localisation precise.",
        ],
      },
      {
        id: 'calls',
        title: '5. Appels audio/video',
        body: [
          "Les appels utilisent signalisation, identifiants d'appel, etat de disponibilite, invitations, acceptations, refus et metadonnees WebRTC.",
          "LiveKit, STUN/TURN et les services temps reel peuvent etre utilises pour connecter les appareils. Sauf fonction d'enregistrement annoncee, le flux audio/video est une communication temps reel.",
        ],
      },
      {
        id: 'ai-payments-third-parties',
        title: '6. IA, paiements et tiers',
        body: [
          "Les prompts, messages, medias, contenus de conference ou demandes Business transmis a l'IA peuvent etre envoyes aux fournisseurs IA configures, notamment Gemini/Google Generative Language ou OpenAI selon le module.",
          "Paystack traite les paiements. Google intervient pour l'authentification. Firebase/Expo peuvent intervenir pour les notifications. LiveKit/STUN/TURN interviennent pour les appels et conferences selon configuration.",
        ],
      },
      {
        id: 'security-rights',
        title: '7. Securite et droits',
        body: [
          "Les communications applicatives utilisent HTTPS/TLS vers l'API. Les WebSockets, jetons, permissions serveur et controles d'acces protegent les fonctions temps reel.",
          "L'utilisateur peut gerer les permissions Android, se deconnecter, supprimer certains contenus selon les fonctions disponibles et demander correction ou suppression de donnees.",
          `Pour exercer une demande relative aux donnees, contactez ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  data: {
    id: 'data',
    title: 'Politique des donnees',
    shortTitle: 'Donnees',
    subtitle: 'Local-first, transit serveur, stockage temporaire, conservation, suppression et services tiers.',
    version: LEGAL_VERSION,
    updatedAt: LEGAL_UPDATED_AT,
    summary:
      "Cette politique precise le chemin des donnees entre telephone, API, WebSocket, serveur, fournisseurs tiers et appareils destinataires.",
    sections: [
      {
        id: 'paths',
        title: '1. Chemin des donnees',
        body: [
          "Message : Telephone A -> interface -> cache local -> API ou WebSocket -> backend Oracle Messenger -> Telephone B -> cache local B -> interface B -> accusés vers A.",
          "Appel : Telephone A -> signalisation serveur -> notification ou ecran entrant B -> acceptation -> connexion WebRTC/LiveKit/STUN/TURN selon reseau -> flux temps reel -> fin d'appel.",
          "Conference : conferencier -> salle -> participants -> etat temps reel -> audio/video/documents/questions/reactions -> IA/PDF lorsque la fonction est demandee.",
        ],
      },
      {
        id: 'zero-storage',
        title: '2. Realite du Zero Storage',
        body: [
          "Oracle Messenger peut viser une logique local-first pour certains medias personnels : ce que l'utilisateur conserve doit principalement etre sur son telephone.",
          "Cela ne signifie pas que le serveur ne traite jamais de donnees. Authentification, routage, livraison, notification, generation, paiement, file d'attente et purge peuvent necessiter un traitement serveur.",
        ],
      },
      {
        id: 'local-server',
        title: '3. Local et serveur',
        body: [
          "Le telephone peut conserver messages caches, medias, brouillons, preferences, contacts importes, fichiers telecharges, diagnostic local et etat de synchronisation.",
          "Le backend peut conserver compte, sessions, relations, conversations, messages, accusés, stories, paiements, credits, conferences, documents, journaux techniques, tokens push et references necessaires au service.",
        ],
      },
      {
        id: 'retention',
        title: '4. Conservation et suppression',
        body: [
          "Les donnees locales restent sur l'appareil tant que l'utilisateur ne les supprime pas, ne vide pas le stockage de l'application ou ne desinstalle pas l'application.",
          "Les donnees serveur necessaires au compte, aux paiements, a la securite, aux conferences ou aux obligations legales peuvent etre conservees plus longtemps que les medias temporaires.",
          "Les copies serveur de medias ou documents temporaires doivent etre purgees selon les regles techniques activees, notamment apres livraison ou telechargement confirme lorsque cette logique est implementee.",
        ],
      },
      {
        id: 'third-party-cache',
        title: '5. Tiers, cache et mises a jour',
        body: [
          "Google, Firebase/Expo, Paystack, LiveKit/STUN/TURN et les fournisseurs IA peuvent traiter les donnees strictement necessaires a leur role.",
          "Les caches doivent accelerer l'affichage sans masquer une nouvelle version, une photo mise a jour, un nouvel accusé ou un changement de presence.",
          `Pour toute demande de donnees, contactez ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
};
