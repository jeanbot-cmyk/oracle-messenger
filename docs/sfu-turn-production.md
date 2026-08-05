# Oracle Messenger SFU/TURN Production

## Objectif

Les appels 1:1 peuvent rester en WebRTC direct avec STUN/TURN.
Les appels de groupe doivent utiliser un SFU pour éviter le maillage complet entre téléphones.

Le code frontend est prêt pour un mode progressif :

- appel individuel : WebRTC direct ;
- appel de groupe : LiveKit SFU si le backend renvoie `enabled: true` ;
- fallback : WebRTC actuel si LiveKit n'est pas encore configuré.

## DNS requis

Créer un sous-domaine dédié :

```text
livekit.oracle-plus.online A 180.149.196.5
```

Sans ce DNS, le navigateur ne peut pas établir un `wss://livekit.oracle-plus.online` fiable avec TLS.

## Ports à ouvrir sur le VPS

```text
443/tcp    HTTPS/WSS via reverse proxy
7881/tcp   WebRTC TCP fallback
50000-50100/udp médias WebRTC SFU
3478/tcp   TURN existant
3478/udp   TURN existant
```

Pour une forte montée en charge, élargir la plage UDP LiveKit au-delà de `50000-50100`.

Pour le plan de resize VPS, migration et architecture multi-serveurs, voir :

```text
docs/vps-resize-and-multiserver-runbook.md
```

## Démarrer LiveKit

Sur le VPS, après création du DNS :

```bash
export LIVEKIT_API_KEY="oracle_$(date +%s)"
export LIVEKIT_API_SECRET="$(openssl rand -hex 32)"
scripts/deploy-livekit-sfu.sh livekit.oracle-plus.online 180.149.196.5
```

Puis ajouter ces variables au conteneur backend :

```bash
LIVEKIT_URL=wss://livekit.oracle-plus.online
LIVEKIT_API_KEY=<valeur>
LIVEKIT_API_SECRET=<valeur>
```

## Validation

Avec un JWT utilisateur backend :

```bash
BACKEND_TOKEN=<jwt> scripts/check-sfu-config.sh
```

Résultat attendu :

```json
{
  "enabled": true,
  "provider": "livekit",
  "url": "wss://livekit.oracle-plus.online",
  "room": "sfu-preflight",
  "token": "..."
}
```
