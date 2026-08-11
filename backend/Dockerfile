FROM node:22-alpine AS builder
WORKDIR /app
# OpenSSL requis par Prisma sur Alpine. FFmpeg assemble les fragments IA vidéo.
RUN apk add --no-cache openssl ffmpeg
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# OpenSSL requis par Prisma au runtime. FFmpeg assemble les fragments IA vidéo.
RUN apk add --no-cache openssl ffmpeg
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
EXPOSE 3001
# Appliquer uniquement les migrations versionnées en production, sans perte de données.
CMD ["sh", "-c", "n=0; until npx prisma migrate deploy --schema=prisma/schema.prisma || [ $n -ge 10 ]; do n=$((n+1)); echo \"DB not ready, attempt $n/10, retrying in 5s...\"; sleep 5; done && node dist/main"]
