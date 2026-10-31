# Image de production du site de recharge DRAMA (Nuxt SSR, cahier des charges §11).
#
# Construit depuis la racine du monorepo web/ (npm workspaces : layers/base + apps/recharge) :
#   docker build -t drama-recharge:latest -f apps/recharge/Dockerfile .
#
# SSR (contrairement au back-office statique) : `runtimeConfig.public` est résolu à chaque requête
# par le serveur Nitro à partir de process.env (NUXT_PUBLIC_*), pas figé dans le bundle au build —
# les valeurs de production se passent au conteneur au démarrage (docker-compose), pas ici.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY layers ./layers
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/recharge/package.json ./apps/recharge/package.json
# Pinned to the npm version package-lock.json was generated with: a newer npm resolves some
# optional transitive deps (e.g. @emnapi/*) differently and `npm ci` then refuses as "out of sync".
RUN npm install -g npm@11.6.2
RUN npm ci
COPY apps/recharge ./apps/recharge
RUN npm run build -w @drama/recharge

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S drama && adduser -S drama -G drama
COPY --from=build /app/apps/recharge/.output ./.output
USER drama
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
