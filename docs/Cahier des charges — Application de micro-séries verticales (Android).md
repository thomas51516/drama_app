# Cahier des charges — Application de micro-séries verticales (Android)

Oct 28, 2026 · @Thomas ATCHA

## 1. Contexte, objectifs et périmètre

Le projet vise à livrer en 5 à 6 mois une application Android de micro-séries verticales (format ReelShort, DramaWave, NetShort), monétisée par pièces, abonnement VIP et publicité récompensée, avec son back-office et son backend.

**Objectifs du MVP**

- Diffuser des séries verticales découpées en épisodes de 1 à 3 minutes, avec un démarrage de lecture inférieur à 1,5 s sur réseau 4G.
- Monétiser dès le lancement : épisodes gratuits, puis déblocage par pièces, VIP ou pub récompensée.
- Permettre à l'équipe éditoriale de publier une série complète sans intervention technique.
- Mesurer la rétention et le revenu par utilisateur pour piloter les prix et l'acquisition.

**Dans le périmètre**

- Application Android native (Kotlin), téléphones Android 8.0 (API 26) et plus.
- Backend API, base de données, pipeline vidéo et CDN.
- Back-office web d'administration.
- Intégration Google Play Billing, mobile money (via site web), régies publicitaires, analytics.

**Hors périmètre du MVP**

- Application iOS (prévue en phase 2, logique partageable via Kotlin Multiplatform).
- Version TV, lecture hors ligne, commentaires publics et contenu généré par les utilisateurs.
- Production des séries : le contenu est fourni par le client (production propre ou licences).

**Hypothèses retenues**

- Marché : lancement international dès le départ, avec un effort marketing renforcé sur l'Afrique de l'Ouest et centrale francophone et la diaspora.
- Langues de l'interface : français, anglais, espagnol et portugais au lancement ; sous-titres multilingues par série.
- Catalogue de lancement : au moins 10 séries complètes de 50 à 80 épisodes.

## 2. Acteurs et profils

| Acteur | Accès | Rôle principal |
| --- | --- | --- |
| Visiteur | App, sans compte (compte invité automatique) | Regarde les épisodes gratuits, peut acheter des pièces |
| Utilisateur inscrit | App (Google, téléphone + OTP, e-mail) | Retrouve historique, solde et achats sur tout appareil |
| Abonné VIP | App | Accès illimité aux épisodes pendant la période d'abonnement |
| Éditeur de contenu | Back-office | Crée séries et épisodes, sous-titres, planification |
| Responsable monétisation | Back-office | Prix, packs de pièces, offres, codes promo |
| Support client | Back-office | Consulte un compte, crédite des pièces, traite les réclamations |
| Administrateur | Back-office | Gère les comptes internes, rôles et paramètres globaux |

## 3. Modèle économique

Chaque série offre ses premiers épisodes gratuitement (paramétrable, 5 à 10 par défaut) ; la suite se débloque par l'un de quatre moyens.

| Mécanisme | Fonctionnement | Paramétrage back-office |
| --- | --- | --- |
| Pièces | Monnaie virtuelle achetée en packs ; chaque épisode coûte un nombre de pièces | Packs, prix, bonus, coût par épisode et par série |
| Pièces bonus | Offertes (connexion quotidienne, tâches, parrainage) ; expirent après un délai | Montants, durée de validité, règles d'attribution |
| Abonnement VIP | Hebdomadaire, mensuel ou annuel ; tous les épisodes débloqués | Formules, prix, période d'essai |
| Pub récompensée | Une vidéo publicitaire regardée débloque un épisode | Plafond quotidien par utilisateur, séries éligibles |

**Règles de consommation**

- Les pièces bonus sont consommées avant les pièces achetées.
- Un épisode débloqué l'est définitivement pour le compte.
- Déblocage automatique optionnel : l'épisode suivant se débloque sans confirmation si le solde le permet.
- Remise sur le déblocage d'une série entière (paramétrable).

## 4. Spécifications fonctionnelles — application Android

Priorités : **P1** = MVP obligatoire, **P2** = souhaité au lancement, **P3** = après lancement.

### 4.1 Accueil et découverte

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-01 | Écran d'accueil : bannière de mise en avant, rangées « Tendances », « Nouveautés », « Continuer à regarder », par genre | P1 |
| M-02 | Flux vertical « Pour vous » : défilement plein écran d'extraits ou de premiers épisodes, lecture automatique | P1 |
| M-03 | Recherche par titre, genre, mot-clé ; suggestions et historique de recherche | P1 |
| M-04 | Classements (top du jour, de la semaine, par genre) | P2 |
| M-05 | Calendrier des sorties et séries « à venir » avec rappel | P3 |

### 4.2 Fiche série et lecteur

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-10 | Fiche série : affiche, synopsis, genres, nombre d'épisodes, grille des épisodes avec statut (gratuit, débloqué, verrouillé) | P1 |
| M-11 | Lecteur vertical plein écran ; balayage vers le haut = épisode suivant | P1 |
| M-12 | Préchargement de l'épisode suivant ; démarrage < 1,5 s en 4G | P1 |
| M-13 | Contrôles : pause, avance/retour, vitesse (0,75x à 2x), qualité auto ou manuelle | P1 |
| M-14 | Sous-titres activables, choix de langue | P1 |
| M-15 | Reprise à la seconde près, sur tout appareil du compte | P1 |
| M-16 | Favoris (« Ma liste »), mention « J'aime », partage par lien profond | P1 |
| M-17 | Mode économie de données (qualité plafonnée en réseau mobile) | P2 |
| M-18 | Lecture en arrière-plan bloquée, captures d'écran bloquées sur les épisodes payants | P2 |

### 4.3 Paywall et déblocage

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-20 | À la fin d'un épisode gratuit, affichage du paywall : solde, coût, boutons pièces / VIP / pub | P1 |
| M-21 | Déblocage par pièces avec confirmation, ou automatique si l'option est activée | P1 |
| M-22 | Déblocage par pub récompensée, dans la limite quotidienne | P1 |
| M-23 | Déblocage de la série entière à prix réduit | P2 |
| M-24 | Offre de bienvenue (premier achat) et offres limitées dans le temps | P2 |

### 4.4 Boutique, portefeuille et VIP

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-30 | Boutique : packs de pièces et formules VIP, prix en devise locale | P1 |
| M-31 | Achat via Google Play Billing ; restauration des achats | P1 |
| M-32 | Portefeuille : solde pièces achetées / bonus, historique des transactions et déblocages | P1 |
| M-33 | Gestion de l'abonnement VIP (statut, échéance, lien vers Google Play) | P1 |
| M-34 | Lien vers la recharge mobile money sur le site web | P2 |

### 4.5 Récompenses et fidélisation

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-40 | Connexion quotidienne (check-in) avec pièces bonus croissantes sur 7 jours | P1 |
| M-41 | Tâches : regarder X épisodes, activer les notifications, partager | P2 |
| M-42 | Parrainage par code ou lien | P3 |

### 4.6 Compte et paramètres

| Réf. | Fonction | Priorité |
| --- | --- | --- |
| M-50 | Compte invité automatique au premier lancement, rattachable à un compte | P1 |
| M-51 | Connexion Google, téléphone + OTP SMS, e-mail | P1 |
| M-52 | Profil, langue, préférences de notification, suppression du compte | P1 |
| M-53 | Centre d'aide, FAQ, formulaire de contact support | P1 |
| M-54 | Notifications push : nouvel épisode d'une série suivie, offre, rappel de check-in | P1 |

## 5. Spécifications fonctionnelles — back-office web

| Réf. | Module | Fonctions | Priorité |
| --- | --- | --- | --- |
| B-01 | Catalogue | Créer une série (titre, synopsis, affiche verticale et horizontale, genres, tags, langue, classification d'âge) ; statut brouillon / publié / archivé | P1 |
| B-02 | Épisodes | Upload en masse des fichiers vidéo, numérotation automatique, suivi du transcodage, aperçu, réordonnancement | P1 |
| B-03 | Sous-titres | Import SRT/VTT par langue et par épisode, aperçu synchronisé | P1 |
| B-04 | Planification | Publication programmée d'une série ou d'épisodes (sortie quotidienne) | P2 |
| B-05 | Mise en avant | Gestion des bannières, rangées de l'accueil et ordre d'affichage, par pays | P1 |
| B-06 | Monétisation | Nombre d'épisodes gratuits, coût par épisode, packs de pièces, formules VIP, plafond de pubs | P1 |
| B-07 | Offres et promos | Offres de bienvenue, offres limitées, codes promo (pièces offertes) | P2 |
| B-08 | Récompenses | Barème du check-in, tâches, validité des pièces bonus | P1 |
| B-09 | Utilisateurs | Recherche d'un compte, historique d'achats et de déblocages, crédit/débit manuel de pièces (journalisé), blocage | P1 |
| B-10 | Notifications | Campagnes push ciblées (tous, par pays, par série suivie, inactifs depuis X jours) | P2 |
| B-11 | Tableaux de bord | Utilisateurs actifs, revenus par source, top séries, rétention par épisode, conversion au paywall | P1 |
| B-12 | Droits et contrats | Ayant droit, territoires autorisés, dates de début/fin de licence par série | P2 |
| B-13 | Administration | Comptes internes, rôles (éditeur, monétisation, support, admin), journal d'audit | P1 |

Toute action sensible (crédit de pièces, modification de prix, suppression) est tracée dans le journal d'audit avec l'auteur, la date et l'ancienne valeur.

## 6. Architecture technique globale

Une API unique porte toute la logique métier ; les fichiers vidéo ne transitent jamais par elle et sont servis directement par le CDN.

&#91;embedded content: architecture cible · clients, API, données, vidéo, services externes\]

Le back-office dépose les vidéos dans le stockage objet par URL pré-signée ; le transcodage prévient l'API par webhook quand un épisode est prêt. Pour lire, l'app demande à l'API une URL signée, puis lit la vidéo sur le CDN.

## 7. Application mobile — stack et exigences techniques

L'application est développée en Kotlin natif avec Jetpack Compose et Media3, en modules séparés pour permettre une migration ultérieure de la logique métier vers Kotlin Multiplatform.

| Couche | Technologie retenue |
| --- | --- |
| Langage | Kotlin (dernière version stable), Coroutines et Flow |
| Interface | Jetpack Compose, Material 3, `VerticalPager` pour le flux vertical |
| Navigation | Navigation Compose, liens profonds (App Links) |
| Lecture vidéo | Media3 ExoPlayer (HLS, ABR, Widevine), `PreloadManager`, `SimpleCache` |
| Architecture | Clean Architecture + MVVM/MVI ; modules `core`, `data`, `domain`, `feature-*` |
| Injection | Hilt |
| Réseau | Retrofit + OkHttp (ou Ktor client), sérialisation kotlinx.serialization |
| Stockage local | Room (historique, progression, cache catalogue), DataStore (préférences) |
| Images | Coil |
| Paiements | Google Play Billing Library (dernière version supportée par Google) |
| Publicité | Google AdMob ou AppLovin MAX (médiation) |
| Services | Firebase : Cloud Messaging, Analytics, Crashlytics, Remote Config, App Check |
| Attribution | AppsFlyer ou Adjust |
| Qualité | Tests unitaires JUnit + MockK, tests UI Compose, ktlint/detekt |

**Exigences non fonctionnelles**

- Compatibilité : Android 8.0 (API 26) et plus ; cible : dernière API exigée par Google Play.
- Performance : démarrage à froid < 2,5 s sur un appareil d'entrée de gamme (2 Go de RAM) ; défilement à 60 images/s.
- Taille de l'APK/AAB téléchargé < 30 Mo ; publication en Android App Bundle.
- Réseau : fonctionnement dégradé correct en 3G ; reprise automatique après coupure.
- Taux de sessions sans plantage ≥ 99,5 % (Crashlytics).
- Sécurité : obfuscation R8, certificate pinning sur l'API, Play Integrity API pour détecter les appareils compromis, aucun secret dans l'APK.
- Accessibilité : tailles de texte dynamiques, contrastes conformes, libellés pour lecteurs d'écran.

## 8. Backend — API, données et règles métier

Le backend est un monolithe modulaire NestJS (TypeScript) sur PostgreSQL et Redis : une seule application déployable, découpée en modules métier, scindable plus tard si la charge l'exige.

### 8.1 Stack

| Composant | Technologie |
| --- | --- |
| Framework API | NestJS (Node.js LTS), REST + documentation OpenAPI/Swagger |
| Base de données | PostgreSQL 16+, ORM Prisma ou TypeORM, migrations versionnées |
| Cache et compteurs | Redis (sessions, cache catalogue, limites de débit, plafonds de pubs) |
| Tâches asynchrones | BullMQ sur Redis (webhooks paiement, notifications, transcodage) |
| Stockage objet | Compatible S3 (Cloudflare R2, Wasabi ou AWS S3) |
| Authentification | JWT d'accès courts + jetons de rafraîchissement ; Firebase Auth ou module maison pour OTP |
| Recherche | Recherche plein texte PostgreSQL au MVP ; Meilisearch si le catalogue grossit |

### 8.2 Modules et principaux endpoints

| Module | Endpoints principaux |
| --- | --- |
| Auth | `POST /auth/guest`, `/auth/google`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh` |
| Catalogue | `GET /home`, `/series`, `/series/{id}`, `/series/{id}/episodes`, `/search`, `/feed` |
| Lecture | `POST /episodes/{id}/play` (vérifie le droit, renvoie l'URL signée), `PUT /progress` |
| Déblocage | `POST /episodes/{id}/unlock` (pièces), `POST /ads/reward` (callback serveur de la régie) |
| Portefeuille | `GET /wallet`, `GET /wallet/transactions` |
| Paiements | `POST /billing/google/verify`, `POST /webhooks/google-rtdn`, `POST /webhooks/mobile-money/{provider}` |
| Récompenses | `POST /rewards/checkin`, `GET /rewards/tasks`, `POST /rewards/tasks/{id}/claim` |
| Utilisateur | `GET/PATCH /me`, `DELETE /me`, `GET/POST/DELETE /me/favorites` |
| Admin | Endpoints `/admin/*` réservés au back-office, contrôlés par rôle |

### 8.3 Modèle de données (entités principales)

| Entité | Champs clés |
| --- | --- |
| `users` | id, type (invité/inscrit), téléphone, e-mail, pays, langue, statut VIP, date d'expiration VIP |
| `series` | id, titre, synopsis, genres, affiches, nb épisodes gratuits, coût par épisode, statut, territoires |
| `episodes` | id, série, numéro, durée, statut de transcodage, clé HLS, date de publication |
| `subtitles` | épisode, langue, URL du fichier VTT |
| `wallets` | utilisateur, solde pièces achetées, solde pièces bonus |
| `coin_ledger` | id, utilisateur, montant (+/-), type (achat, bonus, déblocage, ajustement), référence, date d'expiration |
| `unlocks` | utilisateur, épisode, moyen (pièces, pub, VIP, gratuit), date — unique (utilisateur, épisode) |
| `purchases` | utilisateur, fournisseur (Google, mobile money), produit, jeton, montant, devise, statut |
| `subscriptions` | utilisateur, formule, début, fin, renouvellement auto, statut |
| `watch_progress` | utilisateur, épisode, position en secondes, terminé |
| `audit_logs` | acteur, action, cible, ancienne et nouvelle valeur, date |

### 8.4 Règles métier critiques

- **Le serveur fait foi** : le solde, les droits et les prix ne sont jamais calculés côté application.
- **Grand livre des pièces** : toute variation de solde est une ligne de `coin_ledger` ; le solde est une projection recalculable. Aucune mise à jour directe du solde.
- **Idempotence** : chaque achat, déblocage et récompense porte une clé unique ; un double appel ne débite ou ne crédite qu'une fois.
- **Transactions atomiques** : débit des pièces et création du déblocage dans la même transaction SQL.
- **Vérification des achats** côté serveur via la Google Play Developer API ; l'achat n'est crédité qu'après validation, puis acquitté.
- **Pub récompensée** : crédit uniquement sur callback serveur signé de la régie (SSV), jamais sur simple signal de l'application.
- **Expiration des pièces bonus** par tâche planifiée quotidienne.

## 9. Pipeline vidéo, CDN et protection

Les vidéos sont transcodées en HLS multi-débits et diffusées par CDN via des URLs signées expirantes ; la DRM Widevine est activée sur les épisodes payants.

1. **Fichier maître** : l'éditeur dépose une vidéo verticale 9:16, 1080x1920, H.264, depuis le back-office (upload direct vers le stockage objet par URL pré-signée).
2. **Transcodage** : génération des rendus HLS (CMAF) 240p, 360p, 540p, 720p et 1080p, segments de 2 à 4 s, plus une vignette et un extrait de 15 s pour le flux.
3. **Chiffrement** : clé AES-128 au minimum ; Widevine (DRM) pour les épisodes payants.
4. **Publication** : le statut de l'épisode passe à « prêt » par webhook ; le back-office l'affiche.
5. **Diffusion** : l'API renvoie une URL de manifeste signée valable quelques minutes, uniquement si l'utilisateur a le droit d'accès.

**Options de mise en œuvre**

| Option | Avantages | Limites |
| --- | --- | --- |
| Service géré (Mux, Cloudflare Stream, Bunny Stream) | Mise en route rapide, transcodage + CDN + URLs signées inclus | Coût à la minute stockée et visionnée ; DRM selon l'offre |
| Cloud (AWS MediaConvert + S3 + CloudFront) | DRM complète, contrôle fin | Plus de travail d'intégration et d'exploitation |
| Maison (FFmpeg sur workers + stockage S3 + CDN) | Coût unitaire le plus bas à grande échelle | Exploitation lourde ; DRM à intégrer via un fournisseur tiers |

Recommandation MVP : un service géré, pour livrer vite et mesurer les coûts réels avant d'internaliser.

**Exigences**

- CDN à couverture mondiale (Europe, Amériques, Asie) incluant des points de présence en Afrique de l'Ouest (Lagos, Abidjan, Dakar, Accra).
- Débit initial adapté au réseau ; premier segment en basse qualité pour démarrer vite.
- Filigrane invisible ou identifiant utilisateur (option P3) pour tracer les fuites.

## 10. Paiements

Dans l'application, les achats de pièces et d'abonnements passent par Google Play Billing ; le mobile money est proposé via un site web de recharge qui crédite le même compte.

**Google Play Billing**

- Produits consommables (packs de pièces) et abonnements (VIP hebdo, mensuel, annuel), créés dans la Play Console.
- Vérification serveur de chaque jeton d'achat, puis acquittement (sinon Google rembourse automatiquement).
- Notifications temps réel des développeurs (RTDN via Pub/Sub) pour renouvellements, annulations, remboursements.
- Commission Google : 15 % ou plus selon le programme et le chiffre d'affaires ; à intégrer dans les prix.

**Mobile money (site web de recharge)**

- Agrégateur : CinetPay, FedaPay ou PayDunya (Flooz, Mixx by Yas, MTN MoMo, Orange Money, Wave selon les pays).
- L'utilisateur se connecte avec le même compte, choisit un pack, paie ; le webhook signé de l'agrégateur crédite les pièces.
- Les règles de Google Play sur le renvoi vers un paiement externe évoluent selon les pays : la présence d'un lien dans l'application doit être validée juridiquement avant publication.

**Exigences communes**

- Réconciliation quotidienne entre transactions reçues et pièces créditées.
- Gestion des remboursements : débit des pièces correspondantes, solde négatif bloquant les déblocages.
- Prix affichés en devise locale (FCFA, NGN, GHS, EUR, USD).

## 11. Frontend web — back-office et site de recharge

Le back-office et le site de recharge mobile money partagent une même base Nuxt 3 (Vue 3, TypeScript), en deux applications distinctes.

| Élément | Technologie |
| --- | --- |
| Framework | Nuxt 3, Vue 3, TypeScript |
| Interface | PrimeVue ou Vuetify (tableaux, formulaires) + Tailwind CSS |
| État | Pinia |
| Graphiques | ECharts ou Chart.js pour les tableaux de bord |
| Upload vidéo | Upload direct et reprenable (tus ou multipart S3) |
| Authentification | JWT admin + double authentification (TOTP) obligatoire |
| Site de recharge | Rendu serveur (SSR), responsive mobile, léger (< 300 Ko par page) |

Le back-office est réservé aux comptes internes, accessible uniquement en HTTPS, avec restriction possible par adresse IP.

## 12. Infrastructure, DevOps, sécurité et performance

L'ensemble tourne en conteneurs Docker, d'abord sur un VPS ou petit cluster, avec base de données managée et sauvegardes automatiques ; la vidéo est servie par le CDN, pas par les serveurs applicatifs.

**Environnements** : développement, recette (staging), production — séparés, avec données de test distinctes.

| Élément | Choix |
| --- | --- |
| Conteneurs | Docker ; Docker Compose au MVP, Kubernetes (k3s) si la charge l'exige |
| Hébergement API | VPS (Hetzner, OVH, Contabo) ou cloud (AWS, GCP) |
| Base de données | PostgreSQL managé ou répliqué, sauvegarde quotidienne + point-in-time recovery |
| CI/CD | GitHub Actions ou GitLab CI : tests, build, déploiement ; publication Android via Gradle Play Publisher |
| Reverse proxy | Traefik ou Nginx, TLS Let's Encrypt |
| Supervision | Prometheus + Grafana, logs centralisés (Loki), alertes ; Sentry pour l'API et le web |
| Protection | Cloudflare devant l'API (anti-DDoS, WAF) |

**Sécurité**

- HTTPS partout, HSTS ; secrets dans un coffre (variables chiffrées du CI, Vault ou équivalent).
- Limitation de débit sur l'authentification, l'OTP et le déblocage.
- Vérification des signatures de tous les webhooks (Google, agrégateurs, régies pub).
- Mots de passe internes hachés (Argon2), 2FA sur le back-office, principe du moindre privilège.
- Test d'intrusion avant lancement.

**Performance et disponibilité**

- Temps de réponse API p95 < 300 ms sur les endpoints de lecture.
- Disponibilité cible 99,5 % au MVP.
- Tenue de charge validée à 5 000 utilisateurs simultanés avant lancement.
- Plan de reprise : restauration de la base testée trimestriellement, RPO 24 h, RTO 4 h.

## 13. Analytics, notifications et marketing

Le pilotage repose sur un plan de marquage commun à l'app et au backend, centré sur la rétention par épisode et la conversion au paywall.

**Événements à tracer (minimum)** : `app_open`, `series_view`, `episode_start`, `episode_complete` (avec numéro d'épisode), `paywall_view`, `unlock` (moyen), `purchase` (produit, montant), `subscription_start`, `ad_reward`, `checkin`, `push_open`.

| Indicateur | Usage |
| --- | --- |
| Rétention J1, J7, J30 | Santé globale de l'app |
| Courbe de visionnage par épisode | Repérer où les spectateurs décrochent dans une série |
| Conversion au paywall | Ajuster l'épisode du paywall et les prix |
| ARPU / ARPPU | Revenu moyen par utilisateur et par payeur |
| Coût d'acquisition (CPI) et ROAS | Rentabilité des campagnes |
| LTV par pays et par canal | Allocation du budget marketing |

**Outils** : Firebase Analytics (+ export BigQuery), AppsFlyer ou Adjust pour l'attribution, Remote Config pour les tests A/B (épisode du paywall, prix des packs, ordre de la boutique).

**Notifications** : FCM, segmentation par série suivie et par inactivité, fréquence plafonnée (2 par jour au maximum).

**Recommandation** : règles simples au MVP (tendances, même genre, continuer à regarder), puis modèle basé sur l'historique de visionnage en phase 2.

## 14. Juridique et conformité

- **Droits sur le contenu** : contrats de cession ou de licence pour chaque série (auteurs, acteurs, musique), avec territoires et durée ; aucune série publiée sans contrat enregistré.
- **Données personnelles** : conformité à la loi togolaise sur la protection des données personnelles et déclaration auprès de l'IPDCP ; conformité aux lois des autres pays ciblés et au RGPD pour les utilisateurs européens.
- **Documents** : CGU, CGV (pièces virtuelles non remboursables sauf obligation légale, expiration des bonus), politique de confidentialité, mentions légales.
- **Google Play** : formulaire « Sécurité des données », classification du contenu, politique de paiement, suppression de compte accessible depuis l'app et le web.
- **Classification d'âge** : chaque série porte un classement ; contenus réservés aux adultes masqués selon l'âge déclaré.
- **Fiscalité** : TVA et retenues sur les ventes numériques selon les pays, à valider avec un conseil fiscal.

## 15. Livrables, planning, équipe et recette

Le MVP est livré en 6 mois, en 4 phases, avec 3 jalons validés par le client.

&#91;embedded content: planning du MVP · 4 phases, 3 jalons\]

Les phases Monétisation et Recette se chevauchent au mois 5 : les tests démarrent sur les fonctions déjà livrées. Développement en sprints de 2 semaines avec démonstration à chaque fin de sprint.

### 15.1 Livrables

| Livrable | Format |
| --- | --- |
| Spécifications détaillées et maquettes | Document + prototype Figma |
| Application Android | AAB publié sur Google Play + code source |
| Backend et API | Code source, documentation OpenAPI, scripts de déploiement |
| Back-office et site de recharge | Code source, application déployée |
| Infrastructure | Configuration Docker, CI/CD, supervision |
| Documentation | Guide d'exploitation, guide back-office, plan de marquage analytics |
| Recette | Cahier de recette, rapports de tests, rapport de test d'intrusion |

Le code source et les comptes (Play Console, cloud, CDN, régies) appartiennent au client.

### 15.2 Équipe type

| Rôle | Effectif |
| --- | --- |
| Chef de projet / analyste métier | 1 |
| Développeurs Android (Kotlin) | 2 |
| Développeur backend (NestJS) | 1 à 2 |
| Développeur web (Nuxt) | 1 |
| Designer UX/UI | 1 (temps partiel) |
| Testeur QA | 1 (à partir du mois 3) |
| DevOps | 1 (temps partiel) |

### 15.3 Recette et critères d'acceptation

- Toutes les fonctions P1 validées sur une liste d'au moins 8 appareils Android, dont 3 d'entrée de gamme.
- Parcours d'achat testé de bout en bout en environnement de test Google Play et en mobile money réel sur faible montant.
- Aucun défaut bloquant ou majeur ouvert ; défauts mineurs listés avec date de correction.
- Objectifs de performance de la section 12 atteints en test de charge.
- Bêta fermée de 2 semaines avec au moins 100 testeurs.
- Garantie de 3 mois après mise en ligne pour la correction des anomalies.

## 16. Estimation budgétaire et risques

Le développement du MVP représente environ 700 jours-homme, soit de l'ordre de 55 à 110 millions FCFA selon les taux journaliers ; ces chiffres sont des ordres de grandeur à affiner après ateliers de cadrage, hors production de contenu et marketing.

### 16.1 Charge de développement (approximative)

| Lot | Jours-homme |
| --- | --- |
| Application Android | 220 |
| Backend et API | 165 |
| Pilotage, analyse métier | 110 |
| Back-office et site de recharge | 80 |
| Tests et recette | 60 |
| Design UX/UI | 50 |
| DevOps, infrastructure, sécurité | 30 |
| **Total** | **715** |

Hypothèse de taux : 75 000 à 150 000 FCFA par jour-homme (équipe locale ou mixte).

### 16.2 Coûts récurrents à prévoir

- **Vidéo (stockage + diffusion)** : proportionnel aux minutes stockées et visionnées ; principal poste variable, à modéliser en coût par heure de visionnage dès les premiers tests.
- **Serveurs, base de données, supervision** : quelques centaines d'euros par mois au démarrage.
- **Services tiers** : agrégateur mobile money (commission par transaction), attribution (selon volume), OTP SMS, DRM.
- **Commissions** : Google Play (15 % et plus) et agrégateurs mobile money.
- **Hors technique** : production ou licences des séries et acquisition payante, généralement les deux postes les plus lourds.

### 16.3 Risques principaux

| Risque | Impact | Parade |
| --- | --- | --- |
| Catalogue insuffisant au lancement | Rétention faible, acquisition gaspillée | Lancer avec 10 séries complètes minimum, rythme de sortie hebdomadaire |
| Coût CDN supérieur aux revenus | Marge négative | Débits plafonnés, CDN négocié, suivi du coût par heure de visionnage |
| Refus ou suspension Google Play (paiement, contenu) | Blocage de la distribution | Revue des règles avant soumission, validation juridique du lien mobile money |
| Piratage des épisodes | Perte de revenus | URLs signées, DRM, blocage des captures, surveillance |
| Fraude (pubs, achats, comptes multiples) | Pièces distribuées à tort | Callbacks serveur, Play Integrity, limites par appareil |
| Faible pouvoir d'achat sur le marché cible | ARPU bas | Packs à petit prix, mobile money, pub récompensée |
