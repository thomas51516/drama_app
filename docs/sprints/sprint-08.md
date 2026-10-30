# Sprint 8 — Infrastructure, sécurité et performance (cahier des charges §12)

Démarré le 30 octobre 2026. Un seul agent à la fois (budget de tokens serré, décision du client).
Objectif : tout ce qui peut être fait sans hébergeur ni domaine réels — tenue de charge, sauvegarde
testée, durcissement de sécurité, gabarits de déploiement — pour que le passage en staging soit
une question de configuration, pas de développement.

## Ce qui existe déjà (sprints 1 à 7, à ne pas refaire)

- Sauvegarde quotidienne `postgres-backup` + `infra/scripts/backup.sh` / `restore.sh` (sprint 5).
- Règles d'alerte Prometheus `infra/monitoring/prometheus/alerts.yml` (sprint 5).
- Limitation de débit sur `/auth/*`, `/admin/auth/*`, `/help/contact`, OTP (sprints 1 à 5).
- Vérification de signature sur tous les webhooks : Google RTDN, pub SSV, mobile money (sprints 6-7).
- Argon2 sur les mots de passe, TOTP obligatoire sur le back-office (sprint 1).
- Sentry optionnel sur `SENTRY_DSN` (sprint 1), métriques Prometheus (sprints 1, 5).

## Tickets de ce sprint

| ID | Ticket | Statut |
| --- | --- | --- |
| S10-OPS-01 | Test de charge à 5 000 utilisateurs simultanés sur les endpoints de lecture, correctifs si p95 > 300 ms | En cours |
| S10-OPS-03 | Restauration complète de la base testée en conditions réelles, RPO et RTO mesurés | En cours |
| Sécurité | Audit : limitation de débit, signatures de webhooks, secrets, en-têtes HTTP, autodiagnostic façon test d'intrusion (le vrai test reste un prestataire externe avant lancement) | En cours |
| Déploiement | Gabarits `docker-compose.prod.yml`, Traefik avec TLS Let's Encrypt, variables de production documentées, pour un déploiement en une commande une fois l'hébergeur choisi | En cours |
| CI/CD | Secrets du pipeline, revue des permissions, validation du build de production | En cours |

## Reporté à un sprint ultérieur

- Certificate pinning et Play Integrity côté Android (cahier des charges §7) : passe dédiée séparée.
- Vrai test d'intrusion par un prestataire : nécessite un environnement accessible depuis l'extérieur.
- Disponibilité 99,5 % et charge réelle : seulement mesurables une fois en production.

## Compte rendu de fin de sprint

À compléter.
