# Oracle Messenger

PWA de messagerie souveraine — inspirée WhatsApp Business.

## Stack

- **Frontend** : Next.js 14 + TypeScript + TailwindCSS + PWA
- **Backend** : NestJS + Fastify + Socket.IO
- **DB** : PostgreSQL + Redis
- **Auth** : Google OAuth2 (NextAuth)
- **Temps réel** : Socket.IO + WebRTC (Phase 2)
- **Stockage** : IndexedDB local (messages/médias jamais sur le serveur)

## Démarrage rapide

```bash
cp .env.example .env
# Remplir les variables dans .env

docker-compose up -d
# Migration DB
docker-compose exec backend npx prisma migrate deploy
```

## Phases

- **Phase 1** ✅ : Auth Google, Chat temps réel, PWA, Notifications push
- **Phase 2** : Appels WebRTC, Hub Business, CRM, Deep Linking
- **Phase 3** : IA avancée, automatisation, analytics
