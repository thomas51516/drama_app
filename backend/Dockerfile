# Image de production de l'API DRAMA (S10-OPS, cahier des charges §12).
#
# Construction en deux étapes : `build` installe TOUTES les dépendances (y compris les
# devDependencies — `prisma` CLI y compris, nécessaire à `prisma migrate deploy` au démarrage du
# conteneur) et compile `src/` en JavaScript ; `runtime` réutilise ce `node_modules` déjà installé
# et ne copie que le résultat compilé. Volontairement simple pour un premier déploiement réel :
# l'optimisation (séparer les dépendances de production pour alléger l'image, cache BuildKit par
# couche, image distroless…) est notée comme amélioration possible dans docs/ops/deploiement.md,
# pas faite ici par souci de temps — sans incidence sur la correction du résultat.
#
# Construire : docker build -t drama-api:latest -f backend/Dockerfile backend
# Prisma 7 avec l'adaptateur `@prisma/adapter-pg` (driver `pg` pur JavaScript) : pas de moteur de
# requête natif Rust à faire correspondre à la libc de l'image (alpine/musl) comme avec les anciens
# clients Prisma — c'est pour ça qu'alpine suffit ici sans paquet `openssl` supplémentaire.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg/ffprobe: only needed when TRANSCODE_PROVIDER=local (no managed transcoding service
# configured yet, docs/ops/deploiement.md §2) — harmless otherwise (TRANSCODE_PROVIDER=webhook
# never calls FfmpegRunner).
RUN apk add --no-cache ffmpeg
RUN addgroup -S drama && adduser -S drama -G drama
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# `prisma db seed` runs prisma/seed.ts directly through tsx (not the compiled dist/), and it
# imports the generated client from its schema.prisma `output` path (src/generated/prisma) rather
# than dist/generated/prisma — needed only to run the seed from this image, the compiled app under
# dist/ never reads this copy.
COPY --from=build /app/src/generated ./src/generated
USER drama
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# `prisma migrate deploy` applique les migrations en attente avant de démarrer l'API (idempotent :
# ne rejoue jamais une migration déjà appliquée). Sur plusieurs réplicas simultanés, Prisma pose un
# verrou de migration (`advisory lock` Postgres) : les autres instances attendent, pas de conflit.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
