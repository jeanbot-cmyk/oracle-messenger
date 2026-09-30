# ORAL Messenger — comparaison visible et revue de capacité

**Date :** 24 septembre 2026  
**Périmètre :** dépôts présents dans le workspace : client web `artifacts/oracle-messenger/`, client Android `android-app/`, backend dans l’artefact et ancien arbre `backend/`. Analyse statique uniquement. Aucun appel à l’API, au VPS, à B2 ou à la production; aucun test de charge ni déploiement.

## Conclusion en bref

ORAL Messenger couvre dans son code plusieurs catégories familières d’une messagerie : conversations, groupes, contacts, médias, ACTU, appels audio/vidéo, ainsi que des modules additionnels comme l’IA, l’activité commerciale et les conférences. C’est une base produit large, mais **une interface ou un module présent ne prouve pas qu’un parcours fonctionne de bout en bout**.

Le backend de l’artefact contient des fondations utiles pour évoluer, notamment un adaptateur Redis Socket.IO et des réponses serveur bornées sur plusieurs parcours. Le dépôt conserve aussi un autre arbre backend où l’état de présence des sockets est en mémoire de processus. Avant toute projection de capacité, il faut confirmer quel backend, quelle base et quelle configuration sont effectivement servis.

**Il n’existe pas dans les éléments examinés de mesure de capacité réelle, de latence p95/p99, de test de montée en charge ou de preuve de haute disponibilité. Je ne peux donc pas annoncer un nombre d’utilisateurs simultanés ni garantir une capacité comparable à WhatsApp.** La formulation honnête est : certaines briques peuvent soutenir une croissance, mais la croissance supportée n’a pas été validée.

## Comparaison limitée aux fonctions visibles

La comparaison porte sur les catégories de produit que l’on peut observer, pas sur les systèmes internes, la sécurité ou les performances de WhatsApp.

| Domaine | ORAL Messenger dans les sources locales | Lecture comparative |
| --- | --- | --- |
| Messages individuels et de groupe | Parcours web et Android, Socket.IO, cache et file locale pour les messages texte Android. Le client web n’a pas de retour d’échec explicite dans un chemin d’envoi si socket ou jeton manque. | Fonction centrale comparable au niveau du produit; livraison, ordre, reprise et comportement multi-appareils restent à tester. |
| Contacts | Import Android, cache et correspondance serveur présents. Le chemin Android peut lire jusqu’à 2 000 contacts. | Catégorie présente; la découverte réelle dépend du service et des permissions, pas de l’écran seul. |
| Photos, vidéos et autres médias | Des chemins local, B2 et Google Cloud existent dans les sources. Le client Android a un mécanisme d’upload et de téléchargement; aucune file hors ligne équivalente aux messages texte n’est établie par l’audit. | La présence du stockage ne démontre ni reprise fiable après coupure, ni diffusion CDN, ni débit ou coût à grande échelle. |
| ACTU / stories et fonctions sociales | Feed, publications, réactions, commentaires, profils et cache Android présents statiquement. | Catégorie visible dans le produit; cohérence du fil, pagination, fanout et charge média ne sont pas validés en exécution. |
| Appels | Signalisation, WebRTC/LiveKit et écrans d’appel figurent dans le code. Les appels de groupe et conférences sont aussi représentés. | Équivalence d’usage non démontrée sans appareils, réseau, TURN/SFU, reconnexion et mesures de qualité. |
| Fonctions additionnelles | Modules d’IA, de commerce, de publicité et de conférence apparaissent dans le serveur de l’artefact. | Cela élargit le périmètre du produit, mais ne constitue pas une parité opérationnelle : les services, droits, paiements et parcours réels restent à valider. |
| Confidentialité et chiffrement | Les sources consultées ne suffisent pas à établir la couverture, la gestion des clés ou les replis d’un chiffrement de bout en bout. | Je ne conclus ni à sa présence ni à son absence. Il ne faut pas revendiquer une équivalence de sécurité avec WhatsApp sans audit cryptographique dédié. |

## Onglets principaux et vérification de latence locale

Le client web local a cinq onglets principaux dans `artifacts/oracle-messenger/src/components/layout/MainLayout.tsx:157-177`; Outils et Menu contiennent des destinations imbriquées, qui ne sont pas des onglets supplémentaires.

| Onglet | Contenu visible selon le code local | Limite du constat |
| --- | --- | --- |
| Discussions | Liste de conversations, recherche et filtres (`MainLayout.tsx:307-320`). | Le montage du shell démarre la lecture locale, `api.users.me`, `api.conversations.list` et le socket (`src/app/chat/layout-client.tsx:26,34-62`). |
| Appels | Historique, recherche et actions de rappel audio/vidéo (`MainLayout.tsx:322-325,395-420`). | Aucun chargement réel ni rappel n’a été exécuté pendant cette revue. |
| Actus | L’onglet est une page d’accueil avec bouton qui ouvre `/stories` (`MainLayout.tsx:327-330,623-637`); les stories sont sur une autre route. | La présence d’une route Stories ne prouve pas le chargement ou le fonctionnement du service. |
| Outils | Hub vers Business Assistant, création IA, réponses, traduction, réunion, notes, rappels, galerie et Oracle Web (`MainLayout.tsx:332-335,662-697`). | Ce sont des destinations de plusieurs services; les sous-onglets ne sont pas tous des pages d’un seul backend vérifié. |
| Menu | Profil, contacts, services, partage, thème et déconnexion (`MainLayout.tsx:337-340,729-775`). | L’entrée Admin n’est affichée que pour certains comptes; le film ne la représente pas. |

**Latence par onglet : non mesurée.** `/chat` redirige les visiteurs sans session vers `/login` (`src/app/chat/page.tsx:7-10`). Pour obtenir les onglets réels, le shell a besoin d’une session; son démarrage lance aussi des requêtes et une connexion socket. Comme la portée choisie ici interdit les appels aux services, une mesure numérique par onglet n’est pas disponible dans ce parcours local sans session ni données. Je ne remplace pas cette mesure par une estimation du code. Il faudrait une session de test et des réponses synthétiques isolées, ou un staging, pour chronométrer les interactions. Le résultat présent est un inventaire statique des onglets, pas une validation de leur latence.

## Éléments favorables à la croissance

- **Temps réel distribué dans le backend de l’artefact :** `artifacts/oracle-messenger/server/src/gateway/chat.gateway.ts:256` installe l’adaptateur Redis de Socket.IO. La disponibilité et le comportement de cette configuration n’ont pas été testés ici.
- **Dépendances opérationnelles explicites :** `artifacts/oracle-messenger/server/src/app.module.ts:38-71` expose un contrôle qui teste la base et Redis; pour TURN, LiveKit et Firebase, il vérifie seulement la présence de configuration. Il retourne `degraded` si les conditions de son indicateur « industrial-ready » ne sont pas réunies et liste les essais sur deux téléphones comme exigence, sans les exécuter ici.
- **Résultats bornés côté serveur sur certains parcours :** `artifacts/oracle-messenger/server/src/chat/chat.service.ts:413-452` borne à 80 les résultats de recherche de conversations; un autre parcours de messages applique une limite à 50 vers `:1240`. Cela ne borne pas la liste générale des conversations et ne suffit pas à caractériser l’indexation, le coût des requêtes ou le débit soutenable.
- **Listes Android virtualisées :** `android-app/src/screens/home/NativeMessageList.tsx:377-409` utilise une `FlatList`. Cela aide l’affichage de longues listes, mais l’audit note que la préparation et les mises à jour de données peuvent encore parcourir ou retrier de nombreux messages.
- **Stockage objet prévu :** le code contient des modes de stockage local et cloud. Le serveur racine peut servir des objets B2 par son propre chemin de téléchargement (`backend/src/main.ts:16-47`); ce chemin ne prouve pas l’existence d’un CDN ni sa configuration en production.

## Risques qui empêchent d’estimer une capacité

1. **Source d’exécution ambiguë.** Le dépôt a `backend/` et `artifacts/oracle-messenger/server/`. Dans l’ancien arbre, `backend/src/gateway/socket-state.service.ts:10-46` conserve la table utilisateur→sockets dans une `Map` locale au processus. L’autre backend installe Redis dans son gateway. Ce ne sont pas des architectures interchangeables : il faut verrouiller la source de release et sa configuration avant de raisonner sur plusieurs instances.
2. **Aucun résultat de charge ou de disponibilité.** Aucun chiffre d’utilisateurs simultanés, de messages par seconde, de p95/p99, d’erreurs sous charge, de saturation de base, de mémoire par socket ou de reprise après panne n’est fourni par l’audit local. La revue Android classe la charge comme non vérifiée (`android-app/docs/oracle-messenger-android-audit-2026-09-24.md:22,35-39`).
3. **Coût des parcours web et des résumés.** Le guide QA relève, avec des références locales, le chargement de la liste avant l’affichage du chat et le tri/recalcul de messages (`docs/oracle-messenger-local-android-qa.md:70-74`), ainsi qu’un chemin d’envoi optimiste sans état d’échec explicite lorsque le socket ou le jeton manque (`:78`; code local `artifacts/oracle-messenger/src/hooks/useSocket.ts:178-217`). Le rafraîchissement Android est également référencé dans une source locale. En revanche, la diffusion serveur des résumés est attribuée à `backend-vps-active/`, arbre absent du workspace; elle n’est donc pas vérifiable ici et n’est pas retenue comme constat de code local. Ces coûts restent des pistes à profiler, pas des causes de lenteur prouvées.
4. **Médias et réseau instable.** Le mode B2 du backend racine sert les lectures via le serveur applicatif; les sources locales ne prouvent pas une distribution en périphérie, une reprise systématique des téléversements B2 ou une capacité mesurée. L’audit Android note que les messages texte ont une file hors ligne, contrairement aux médias et aux actions sociales (`android-app/docs/oracle-messenger-android-audit-2026-09-24.md:18-22,53-57`).
5. **Appels et fanout social.** Les appels dépendent de TURN/LiveKit et du réseau; le feed peut mobiliser beaucoup de destinataires, de médias, de réactions et de notifications. Aucun test multi-utilisateur ne permet de vérifier ces coûts de bout en bout.
6. **Sécurité non certifiée.** L’audit client ne peut pas valider les autorisations serveur, l’isolation entre comptes, les clés de chiffrement ou la protection des médias. Les éléments locaux ne doivent pas être interprétés comme une certification de sécurité.

## Ce qui permettrait de conclure sans toucher à la production

1. **Identifier et figer en staging la release réellement utilisée**, le schéma de données, Redis, le stockage média et le chemin de chaque client. Ne pas remplacer le backend plus complet du serveur par une branche locale et ne pas appliquer de migration locale à la base de production.
2. **Créer des comptes, conversations, contacts et médias synthétiques** dans un environnement isolé; vérifier d’abord livraison, déduplication, ordre, reconnexion, reprise média et comportement après redémarrage.
3. **Faire des tests progressifs et contrôlés** sur les parcours distincts : connexion/socket, envoi et ouverture de conversations, stories/ACTU, médias, puis appels sur appareils de test.
4. **Mesurer les résultats**, au minimum p50/p95/p99, taux d’erreur, sockets actives, débit de messages, latence de base de données, connexions et CPU/mémoire, retards de files et coûts de média. Fixer des critères d’arrêt avant l’essai.
5. **Augmenter la charge par paliers**, examiner les goulots observés et répéter après correction. La capacité retenue devra correspondre à un niveau soutenu et à un niveau de pointe, avec une marge et des scénarios de panne documentés.

## Sources et limites de l’examen

- `docs/oracle-messenger-local-android-qa.md` décrit les limites statiques du web, d’Android, des messages, contacts et appels; son protocole ne contacte pas l’API de production.
- `android-app/docs/oracle-messenger-android-audit-2026-09-24.md` distingue les fonctions visibles dans le client des parcours réellement testés; build sur appareil, charge, API et production n’ont pas été exécutés.
- Les fichiers serveur cités sont des sources présentes dans le workspace. Leur présence ne prouve pas qu’ils correspondent à la release active, ni que leurs variables d’environnement sont configurées comme prévu.
- Le film compagnon est une illustration originale, pas une capture de l’application, une preuve de fonctionnement ou une démonstration de performance.