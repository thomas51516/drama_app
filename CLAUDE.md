# DRAMA — micro-séries verticales (monorepo)

Application Android de micro-séries verticales, monétisée par pièces, VIP et pub récompensée.
Source de vérité fonctionnelle : `docs/Cahier des charges — Application de micro-séries verticales (Android).md`.
Plan d'exécution : `docs/Backlog par sprint — MVP micro-séries verticales.md` (tickets `S<sprint>-<lot>-<n°>`).

## Arborescence

| Dossier | Contenu | Stack |
| --- | --- | --- |
| `backend/` | API NestJS, Prisma, BullMQ | Node 24, TypeScript, PostgreSQL 16, Redis 7 |
| `android/` | Application Android multi-module | Kotlin, Jetpack Compose, Media3, Hilt |
| `web/` | Back-office et site de recharge | Nuxt 3, Vue 3, PrimeVue, Tailwind, Pinia |
| `infra/` | Docker Compose, supervision, scripts | Docker |
| `docs/` | Cahier des charges, backlog, OpenAPI, comptes rendus de sprint | Markdown |
| `.github/workflows/` | CI par lot (`backend-ci`, `android-ci`, `web-ci`) | GitHub Actions |

## Règles communes

- **Le serveur fait foi** : solde, droits et prix ne sont jamais calculés côté client.
- **Grand livre** : toute variation de pièces est une ligne `coin_ledger` ; le solde est une projection. Jamais de mise à jour directe du solde.
- **Idempotence** : achat, déblocage et récompense portent une clé unique.
- **Transactions atomiques** : débit et création du déblocage dans la même transaction SQL.
- **Aucun secret dans le dépôt** : `.env.example` documente les variables, `.env` est ignoré.
- **Langues** : code, identifiants et commits en anglais ; documentation et interfaces utilisateur en français (puis EN, ES, PT).
- **Commits** : Conventional Commits (`feat(backend): ...`, `fix(android): ...`, `chore(web): ...`).
- Chaque ticket du backlog référencé dans le message de commit (`S01-BE-02`).

## Commandes

```bash
# Services de dev (PostgreSQL, Redis, MinIO)
docker compose -f infra/docker-compose.dev.yml up -d

# Backend
cd backend && npm install && npm run dev

# Web (back-office)
cd web && npm install && npm run dev:admin

# Android (JDK 17 requis, voir android/README.md)
cd android && ./gradlew :app:assembleDebug
```

Chaque sous-projet a son propre `README.md` et, si besoin, son propre `CLAUDE.md`.
