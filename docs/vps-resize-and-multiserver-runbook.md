# Oracle Messenger VPS Resize and Multi-Server Runbook

## Objectif

Ce document prepare la montee en charge sans improviser le jour ou le VPS devient plein.
Il couvre deux scenarios :

1. agrandir le VPS actuel ;
2. separer Oracle Messenger sur plusieurs serveurs.

## Niveau 1 - Resize du VPS actuel

Utiliser ce niveau quand le serveur manque de CPU, RAM, disque ou bande passante, mais que le trafic reste gerable sur une seule machine.

### Avant resize

Verifier :

```bash
scripts/vps-capacity-report.sh
```

Sauvegarder :

```bash
scripts/vps-backup-production.sh
```

Points a confirmer avant redemarrage :

- sauvegarde PostgreSQL recente ;
- sauvegarde des uploads medias ;
- copie des variables d'environnement serveur ;
- acces SSH valide ;
- acces au panel hebergeur ;
- DNS sous controle ;
- image Docker ou code de production disponible ;
- fenetre de maintenance annoncee si necessaire.

### Pendant resize

Si l'hebergeur propose un resize direct :

1. arreter proprement les conteneurs si le panel le demande ;
2. lancer le resize CPU/RAM/disque ;
3. redemarrer le VPS ;
4. verifier Docker, disque, memoire et reseau ;
5. relancer les conteneurs si besoin.

### Apres resize

Verifier :

```bash
docker ps
docker logs --tail 80 <backend-container>
docker logs --tail 80 <frontend-container>
curl -fsS https://api-messenger.oracle-plus.online/health
curl -fsS https://messenger.oracle-plus.online
curl -fsS https://livekit.oracle-plus.online
```

Tester ensuite :

- connexion utilisateur ;
- liste conversations ;
- envoi message ;
- appel audio ;
- appel video ;
- appel groupe LiveKit ;
- notification push ;
- upload image/video/document.

## Niveau 2 - Separation minimale des services

Utiliser ce niveau quand le serveur unique commence a etre instable ou quand les appels consomment trop.

Architecture recommandee :

```text
VPS 1 - Frontend/PWA
  messenger.oracle-plus.online

VPS 2 - Backend API + Socket.IO
  api-messenger.oracle-plus.online

VPS 3 - PostgreSQL + Redis
  acces prive uniquement

VPS 4 - LiveKit SFU + TURN
  livekit.oracle-plus.online
  turn.oracle-plus.online

Stockage objet
  medias, photos, videos, documents, backups
```

### DNS

Chaque service doit avoir son domaine :

```text
messenger.oracle-plus.online      A <ip-frontend>
api-messenger.oracle-plus.online  A <ip-backend>
livekit.oracle-plus.online        A <ip-livekit>
turn.oracle-plus.online           A <ip-turn>
```

### Variables frontend

```env
NEXT_PUBLIC_BACKEND_URL=https://api-messenger.oracle-plus.online
BACKEND_URL=https://api-messenger.oracle-plus.online
NEXTAUTH_URL=https://messenger.oracle-plus.online
```

### Variables backend

```env
DATABASE_URL=postgresql://oracle:<password>@<private-db-host>:5432/oracle_messenger
REDIS_URL=redis://<private-redis-host>:6379
FRONTEND_URL=https://messenger.oracle-plus.online
BACKEND_URL=https://api-messenger.oracle-plus.online
LIVEKIT_URL=wss://livekit.oracle-plus.online
TURN_URLS=turn:turn.oracle-plus.online:3478?transport=udp,turn:turn.oracle-plus.online:3478?transport=tcp
PUBLIC_MEDIA_BASE_URL=https://api-messenger.oracle-plus.online/uploads
```

Ne jamais placer les secrets Firebase Admin, LiveKit API secret, JWT secret ou OAuth secret cote frontend.

## Niveau 3 - Forte charge

Utiliser ce niveau quand Oracle Messenger doit supporter beaucoup d'appels simultanes.

Recommandations :

- PostgreSQL manage ou VPS dedie avec sauvegardes automatiques ;
- Redis dedie pour presence, files et coordination temps reel ;
- LiveKit multi-noeuds avec Redis ;
- stockage objet compatible S3 pour les medias ;
- CDN devant le frontend et les medias publics ;
- monitoring CPU/RAM/disque/reseau ;
- alertes disque, RAM, latence API et erreurs 5xx.

### LiveKit

Pour les petits tests, la plage UDP actuelle peut rester reduite.
Pour la production, utiliser une plage plus large :

```env
LIVEKIT_UDP_START=50000
LIVEKIT_UDP_END=52000
```

Ouvrir la meme plage dans le firewall du VPS.

Capacite realiste a valider par tests :

- 10 a 20 participants : possible pour beta avec surveillance ;
- 50 participants video : necessite serveur LiveKit puissant et tests reels ;
- 100+ audio : necessite monitoring et plage UDP large ;
- 500 a 1000+ : necessite architecture LiveKit multi-noeuds, Redis et bande passante elevee.

## Migration vers nouveau VPS

### Preparation nouveau serveur

1. installer Docker ;
2. installer reverse proxy ou Coolify ;
3. ouvrir ports 80/443, 3478, 7881 et plage UDP LiveKit ;
4. creer reseaux Docker ;
5. copier variables d'environnement ;
6. restaurer base PostgreSQL ;
7. restaurer uploads medias ;
8. deployer backend/frontend ;
9. deployer LiveKit/TURN ;
10. tester avec DNS temporaire ou fichier hosts.

### Bascule DNS

Reduire le TTL DNS avant migration si possible.
Quand les tests sont bons, pointer les domaines vers les nouvelles IP.

Validation apres bascule :

```bash
curl -fsS https://messenger.oracle-plus.online
curl -fsS https://api-messenger.oracle-plus.online/health
curl -fsS https://livekit.oracle-plus.online
```

Tester ensuite deux telephones reels avant publication ou annonce utilisateur.

## Sauvegardes minimales

Frequence recommandee :

- PostgreSQL : toutes les 6 heures ;
- uploads medias : quotidien ;
- variables serveur : a chaque modification ;
- exports avant chaque deploy majeur.

Retention :

- 7 sauvegardes quotidiennes ;
- 4 sauvegardes hebdomadaires ;
- 3 sauvegardes mensuelles.

## Critere de decision

Resize simple si :

- CPU moyen > 70 % ;
- RAM disponible < 15 % ;
- disque > 80 % ;
- appels groupe lents mais trafic encore faible.

Passer multi-serveurs si :

- LiveKit ralentit le backend ;
- la base ralentit les messages ;
- les uploads saturent le disque ;
- beaucoup d'utilisateurs connectes en meme temps ;
- besoin de haute disponibilite.

