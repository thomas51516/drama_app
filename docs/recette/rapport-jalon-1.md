# Rapport de recette — Jalon 1 « lot regarder et compte » (S06-QA-02)

**Projet** DRAMA — micro-séries verticales · **Date** 30 octobre 2026 · **Version testée** commit `954ae8e` (application Android 0.3.0, API 1.3.0, back-office) · **Rédaction** QA DRAMA · **Destinataire** client / chef de projet.
Détail des exécutions : `campagne-2026-10-30-jalon1.md` (campagne n° 2) et `campagne-2026-10-30.md` (campagne n° 1) ; défauts : `defauts.md` ; cahier : `cahier-de-recette.md` v1.1.

## 1. Périmètre et résultat global

Le jalon 1 couvre les fonctions **P1** des sprints 1 à 5 : accueil, flux « Pour vous », recherche, fiche série, lecteur vertical (préchargement, contrôles, sous-titres, reprise), favoris / J'aime / partage, compte invité, connexion (e-mail, téléphone + OTP, Google), profil, réglages (langue, notifications), centre d'aide, notifications, et le back-office éditorial (catalogue, épisodes, sous-titres, mise en avant, centre d'aide, campagnes, comptes).

**Résultat : GO sous réserve.** Sur le code testé, toutes les fonctions P1 du lot « regarder » et du compte sont présentes et fonctionnent ; **aucun défaut bloquant ni majeur n'est ouvert** ; aucun plantage de l'application n'a été observé. Les réserves portent sur la **couverture d'appareils** (2 émulateurs exploités sur les 8 appareils exigés, le téléphone du client n'ayant pas pu être utilisé par la recette) et sur **une mesure de démarrage à froid au-dessus de la cible** sur l'émulateur d'entrée de gamme en version de débogage.

| Campagne | Lignes exécutées | Conformes | Non conformes (toutes mineures) | Non testées |
| --- | --- | --- | --- | --- |
| N° 1 (30/10 matin, commit `7aa12b1`) | 130 | 123 | 7 | 20 |
| N° 2 (30/10 après-midi, commit `954ae8e`, sprint 5 inclus) | 123 | 118 | 5 | 112 |

## 2. État des fonctions P1 par lot

| Lot | Fonctions P1 | État au 30/10 | Preuves principales |
| --- | --- | --- | --- |
| Android — découvrir | M-01 accueil, M-02 flux, M-03 recherche | **Validé** (flux : un seul extrait disponible, pagination non testée) | `evidence/jalon1/e36-01…06`, campagne 1 `api36-17` |
| Android — regarder | M-10 fiche, M-11/M-12 lecteur et préchargement, M-13 contrôles, M-14 sous-titres, M-15 reprise | **Validé** sur émulateurs (première image 315 ms, préchargement, enchaînement, verrou du 3e épisode, vitesse / qualité / sous-titres, reprise) ; 4G réelle et sous-titres automatiques en français à confirmer sur téléphone | `e36-10…18` |
| Android — compte | M-16 favoris / J'aime / partage, M-50 invité, M-51 connexion, M-52 profil | **Validé par l'API** (inscription rattachant l'invité, OTP, erreurs, suppression différée, favoris conservés) ; parcours écran de l'inscription **non rejoué** sur appareil (interrompu deux fois) | API RC-156 à 163, `e36-19…21`, `e36-39` |
| Android — sprint 5 | M-52 réglages langue et notifications, M-53 centre d'aide, M-54 notifications, accessibilité | **Validé** : 4 langues appliquées immédiatement, interrupteurs synchronisés, FAQ / contact / demandes, permission demandée au bon moment, libellés d'accessibilité complets, police 200 % ; TalkBack et réception d'un push réel à faire sur téléphone | `e36-22…25`, `e36-31…33`, `e36-44`, `e36-48` |
| Backend / API | contrat v1.3 : auth, catalogue, lecture signée, progression, favoris, aide, notifications, événements, sécurité | **Validé** : 40 cas conformes, 3 écarts mineurs connus (recherche par genre seul, progression sur épisode verrouillé, paramètres non validés) | rapport campagne 2 §5 |
| Back-office | B-01, B-02, B-03, B-03bis, B-05, B-10, B-13 | **Validé** en fumée : 14 pages rendues sans erreur, droits par rôle respectés, centre d'aide avec aperçu identique à l'API ; upload / publication validés en campagne 1 (défaut majeur DEF-001 corrigé depuis) | `web-00…15` |

## 3. Appareils couverts (critère §15.3 : au moins 8 appareils dont 3 d'entrée de gamme)

| Appareil | Catégorie | État |
| --- | --- | --- |
| Émulateur Android 16 (API 36), 2 Go | référence | **Couvert** (85 lignes, 56 conformes) |
| Émulateur Android 10 (API 29), 720×1600, 2 Go, 2 cœurs | entrée de gamme | Partiellement couvert (démarrage, mémoire, invité, push) : émulateur perdu par manque de mémoire de la machine, puis partagé avec l'équipe Android |
| TECNO CM6 (téléphone du client), Android 16 | milieu de gamme | **Non couvert** par la recette (débranché, puis utilisé par l'équipe Android) |
| Appareils 4 à 8 (Android 8 / 2 Go, Android 11-12 Go edition, Android 13 / 4 Go, Android 14 / 120 Hz, tablette) | dont 2 d'entrée de gamme | **À acquérir** |

Couverture : **2 appareils sur 8**, **1 entrée de gamme sur 3** (émulée). Le critère n'est pas atteint ; c'est la première réserve.

## 4. Défauts

| Gravité | Ouverts | Détail |
| --- | --- | --- |
| Bloquant | **0** | — |
| Majeur | **0** | DEF-001 (épisode invisible après publication) corrigé le 30/10 (`35f0339`), à refermer au prochain upload de recette |
| Mineur | **9** | API : recherche par genre seul (DEF-002), progression acceptée sur épisode verrouillé (DEF-003), territoire ignoré à la lecture (DEF-004), paramètres non validés (DEF-008), code d'erreur (DEF-009) ; back-office : message TOTP (DEF-005) ; Android : session invitée remplacée sans message (DEF-006), jeton push envoyé deux fois (DEF-011), puces de genre non traduites (DEF-012) |
| Fermés | 2 | DEF-007 (mélange de langues) et DEF-010 (documentation OpenAPI) |

Tous les défauts mineurs sont planifiés au sprint 6 (`docs/sprints/sprint-06.md`, ligne « DEF-002..009 ») ; DEF-011 et DEF-012 sont à y ajouter. Date de correction visée : fin du sprint 6.

## 5. Objectifs de performance (§7)

| Objectif (cahier des charges §7) | Mesure | Verdict |
| --- | --- | --- |
| Démarrage à froid < 2,5 s sur 2 Go | Émulateur API 36 : **1,2 s** (médiane). Émulateur entrée de gamme API 29 : **2,85 s** en version de débogage sur machine partagée ; 0,57 s mesuré par l'équipe Android en version optimisée (R8 + profil) | **À confirmer** sur téléphone 2 Go réel avec la version optimisée |
| Première image vidéo < 1,5 s en 4G | 0,3 s à froid, 0,1 s préchargé (réseau local, émulateur) | Atteint en local ; **4G réelle à mesurer** |
| Livrable < 30 Mo | 3,9 Mo (AAB mesuré par l'équipe Android) ; 21,5 Mo en débogage | **Atteint** |
| Sessions sans plantage ≥ 99,5 % | 0 plantage sur 2 campagnes (≈ 210 lignes Android) | Atteint en recette ; Crashlytics à suivre en bêta |
| 60 images/s | Non mesurable sur émulateur logiciel | À mesurer sur téléphone |
| Mémoire | 108 à 176 Mo selon l'écran (débogage) | Correct |

## 6. Critères d'acceptation §15.3

| # | Critère | État |
| --- | --- | --- |
| 1 | Fonctions P1 validées sur ≥ 8 appareils dont 3 d'entrée de gamme | **Non atteint** : fonctions validées, 2 appareils sur 8 |
| 2 | Parcours d'achat de bout en bout | Sans objet au jalon 1 (monétisation sprints 7-9) |
| 3 | Aucun défaut bloquant ou majeur ouvert ; mineurs listés avec date | **Atteint** |
| 4 | Objectifs de performance en test de charge | Non testé (campagne k6 à planifier) |
| 5 | Bêta fermée de 2 semaines, ≥ 100 testeurs | Non démarrée |
| 6 | Garantie 3 mois | Contractuel |

## 7. Recommandation

**GO sous réserve** pour la démonstration et la clôture du jalon 1, aux conditions suivantes :

1. Rejouer, avant la démonstration, le parcours complet sur le **téléphone du client en données mobiles** (lecture, 4G, sous-titres français, inscription, langue, aide, notification) — une demi-journée de recette avec l'appareil réservé.
2. Confirmer le **démarrage à froid** de la version optimisée sur un téléphone 2 Go réel (ou, à défaut, sur l'émulateur d'entrée de gamme sur une machine non chargée).
3. Garder les 9 défauts mineurs dans le plan du sprint 6 ; aucun ne gêne la démonstration.

Le critère « 8 appareils » ne pourra être levé qu'avec l'acquisition (ou le prêt) des appareils 4 à 8 de la matrice ; il est proposé de le reporter formellement à la recette finale (jalon 3) tout en démarrant l'achat dès maintenant.

## 8. Ce qui reste avant la démonstration du jalon 1

- Recette sur le CM6 réservé à la QA (cf. recommandation 1) et compte rendu d'une page.
- Mesure du démarrage optimisé sur appareil 2 Go.
- Correction et revérification de DEF-002 à DEF-012 (mineurs) ; refermeture de DEF-001 après un upload de recette.
- Création des comptes de recette ADMIN et SUPPORT du back-office pour couvrir les comptes internes, le journal d'audit et la boîte de réception du support.
- Préparation de la démonstration (`docs/demo/` S06-PM-01) sur un jeu de données propre : la base de développement contient des séries et comptes de test.
- Côté client : fourniture du compte de service Firebase (push réels), du nom de domaine des liens de partage, et lancement de l'achat des appareils de test.
