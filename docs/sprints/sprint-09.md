# Sprint 9 — Tableau de bord complet, droits et contrats, Play Integrity

Démarré le 31 octobre 2026. Un seul lot à la fois (budget de tokens).
Ce qui reste du cahier des charges, hors ce qui dépend d'un hébergeur, d'un domaine ou d'un prestataire.

## Constat

- **B-11 Tableaux de bord** : seuls les compteurs d'utilisateurs et le top séries existent (sprint 4, « v0 »).
  Il manque les revenus par source, la courbe de rétention par épisode et le taux de conversion au paywall,
  explicitement demandés par le cahier des charges §5.
- **B-12 Droits et contrats** : module absent. Le cahier des charges §14 est clair : « aucune série publiée
  sans contrat enregistré ». Aucune règle ne l'impose aujourd'hui, et « La Nounou » est déjà publiée sans
  contrat. Décision prise : construire le module et avertir à la publication si aucun contrat n'est
  enregistré, sans bloquer, pour ne pas casser le contenu réel déjà en ligne. Un blocage strict reste une
  option pour plus tard, sur demande du client.
- **Certificate pinning (§7)** : reporté. Épingler un certificat n'a de sens qu'une fois un vrai nom de
  domaine avec un certificat TLS en production ; en développement il n'y a que du HTTP. Ticket laissé ouvert,
  gated sur l'hébergement réel.
- **Play Integrity API (§7)** : réalisable dès maintenant, indépendant de l'hébergement.

## Tickets

| ID | Ticket | Statut |
| --- | --- | --- |
| B-11 | Revenus par source, rétention par épisode, conversion au paywall | En cours |
| B-12 | Droits et contrats : ayant droit, territoires, dates de licence, avertissement à la publication sans contrat | En cours |
| Sécurité Android | Play Integrity API sur les actions sensibles (déblocage, achat) | En cours |
| Sécurité Android | Certificate pinning | Reporté, gated sur un vrai hébergement TLS |

## Compte rendu de fin de sprint

À compléter.
