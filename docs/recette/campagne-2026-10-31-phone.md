# Campagne de recette n° 3b — 31 octobre 2026 (retest téléphone)

QA DRAMA. Complément de la campagne 3 (`campagne-2026-10-31.md`) : l'émulateur Android n'avait pas pu démarrer
(machine en limite de mémoire), rendant NT tous les parcours à l'écran. Cette campagne 3b rejoue ces parcours sur
le téléphone réel du client (TECNO CM6, connecté en USB/`adb`, atteignant le PC backend en Wi‑Fi), en priorité le
retest de DEF-011 et DEF-012. Défauts : `defauts.md`. Preuves : `evidence/campagne3-phone/`.

## 1. Environnement

| Élément | État |
| --- | --- |
| Téléphone | TECNO CM6, série `137972555Y011409`, connecté via `adb` (USB), Wi‑Fi `TH001-5G`, IP `192.168.1.71` |
| Application | Build debug déjà installé, commit `051ab7a` (sprint 7), `versionName=0.3.0`, `lastUpdateTime=2026-10-30 20:23:36` — **non reconstruit** : aucun code Android n'a changé depuis (HEAD `2a9a3ae` au début de cette campagne) |
| Backend | `:3000`, déjà en marche, non redémarré ; Docker (postgres/redis/minio) déjà up, non touché |
| Compte utilisé | Compte réel du propriétaire (Google, `thomas51516@gmail.com`), identifiant `01a18905-35eb-72fe-8365-6d2e734908dd`, ~900 pièces fake au départ |
| Contenu disponible | « Le Secret du Lagon » (3 épisodes, l'épisode 3 déjà débloqué d'une session précédente), « La Nounou » (2 épisodes, tous gratuits) — **aucun épisode verrouillé disponible** cette campagne (voir §5) |

## 2. DEF-011 — jeton push enregistré deux fois au démarrage

**Statut : fermé (revérifié).**

- Trois cycles `force-stop` + relance (`adb shell am force-stop com.drama.app.debug` puis relance de
  `MainActivity`) ont été observés au Logcat. À chaque démarrage, une seule ligne
  `AppStartup: push token in sync for user=01a18905-...` apparaît ; aucune ligne `Push: push token registered
  user=...` n'apparaît lors des relances (le token et l'utilisateur étaient déjà en cache local, donc aucun appel
  réseau n'était nécessaire — comportement documenté dans le code : « a cold start costs no request »).
- `select count(*), min(created_at), max(updated_at) from push_devices where user_id = '01a18905-...'` en base ne
  renvoie **qu'une seule ligne**, `created_at` et `updated_at` distants de 59 ms (`2026-10-30 11:41:29.243` →
  `.302`), ce qui est cohérent avec un seul upsert et non deux lignes concurrentes.
- Revue du code (`data/src/main/kotlin/com/drama/data/repository/DefaultPushRepository.kt`) : `AppStartup`
  (démarrage de session) et `DramaMessagingService.onNewToken` (FCM) passent tous deux par la même fonction
  `register()`, protégée par un unique `Mutex`, qui compare `(token, userId)` au couple déjà persisté avant
  d'émettre le `PUT /me/devices/push`. Quel que soit l'ordre d'arrivée des deux appelants, le second trouve le
  couple déjà enregistré par le premier et ne renvoie rien — c'est exactement le correctif attendu pour DEF-011.
- **Limite** : n'ayant pas pu forcer une véritable nouvelle inscription (le jeton FCM de l'appareil est stable
  depuis plusieurs jours, et la suppression du fichier de préférences locales pour forcer un nouvel enregistrement
  a été bloquée par le classificateur de sécurité de l'environnement comme « destruction locale irréversible » —
  je n'ai pas tenté de contourner ce refus), le scénario exact de la course (deux appelants simultanés au tout
  premier lancement) n'a pas été rejoué à l'identique. La preuve combinée (code + absence de doublon sur plusieurs
  relances + une seule ligne en base) est jugée suffisante pour refermer le défaut.

## 3. DEF-012 — puces de genre non traduites

**Statut : fermé (revérifié sur Recherche et fiche série), avec deux nouveaux défauts mineurs liés ouverts (voir §6).**

- Changement de langue dans Profil → Paramètres → Langue : Français → English, confirmé par le toast « Language
  saved » et la traduction immédiate de toute l'interface (`phone-03-settings-en.png`).
- Écran Recherche : les puces de genre affichent **Romance, Drama, Comedy, Action** — en anglais, plus « Drame »
  (`phone-07-search-en.png`). C'est exactement le repro original de DEF-012.
- Fiche série « La Nounou » : badge genre **« Drama · Thriller »** en anglais (`phone-08-series-la-nounou-en.png`).
- Classements (Rankings) : puces de genre et libellés des cartes également en anglais
  (`phone-16-rankings.png`).
- Le repro original de DEF-012 (puces de genre de l'écran de recherche) est donc confirmé corrigé.
- Langue remise en Français en fin de campagne (voir §7).

## 4. Économiseur de données — persistance

**Statut : OK.**

- Activé dans Paramètres (`phone-22-datasaver-on.png`).
- `adb shell am force-stop` puis relance de l'application.
- Toujours actif après le redémarrage (`phone-23-datasaver-persisted.png`).
- Désactivé à nouveau en fin de campagne (état initial restauré, voir §7).

## 5. FLAG_SECURE

**Statut : OK (reconfirmé).**

- Aucun épisode verrouillé n'était disponible sur le compte du propriétaire au moment de ce test (« Le Secret du
  Lagon » épisode 3 déjà débloqué lors d'une session précédente, « La Nounou » entièrement gratuite) : conforme à
  la consigne, j'ai testé sur l'épisode payant déjà débloqué en lecture, comme la campagne 1 l'avait fait.
- Lecture de l'épisode 3 de « Le Secret du Lagon » lancée (confirmé au Logcat : `PlayerSpike`, `ExoPlayerImpl`,
  lecture jusqu'à `ended`, progression envoyée `completed=true`).
- `adb exec-out screencap -p` pendant/juste après la lecture : capture entièrement **noire** en dehors des barres
  système (`phone-19-flagsecure-screencap.png`), confirmant que `FLAG_SECURE` bloque toujours la capture d'écran
  sur la surface du lecteur.

## 6. Nouveaux défauts trouvés (hors périmètre initial de DEF-012)

En testant DEF-012 au-delà du seul écran de recherche demandé par le ticket, deux lacunes de traduction
supplémentaires ont été constatées. Elles sont détaillées dans `defauts.md` (DEF-013, DEF-014) ; résumé :

- **DEF-013** (mineur) : après un changement de langue en cours de session (sans redémarrage du processus), les
  libellés de genre déjà affichés sur l'Accueil restent dans l'ancienne langue (« 2 ep. · Drame » en interface
  anglaise, `phone-06-home-en.png`) jusqu'à ce qu'un autre écran (ex. Recherche) déclenche un nouvel appel
  `GET /genres?lang=en` qui met à jour le cache partagé — l'Accueil se corrige alors rétroactivement sans action
  utilisateur (`phone-09-home-en-after-search.png`, prise après une visite de l'écran Recherche). Défaut de
  fraîcheur du cache, pas de perte de données, se résout tout seul en naviguant.
- **DEF-014** (mineur) : l'écran « Pour vous » (flux vertical) affiche le genre de la série directement depuis la
  valeur brute (`item.series.genres`, mise en forme par une simple capitalisation), sans jamais passer par le
  dictionnaire de traduction serveur utilisé par l'Accueil, la Recherche et la fiche série. Constaté : « Drame ·
  Thriller · 2 ep. » alors que l'interface entière était en anglais et que l'Accueil/la Recherche affichaient déjà
  correctement « Drama » au même moment (`phone-20-foryou.png`). Confirmé par lecture du code
  (`feature/feed/src/main/kotlin/com/drama/feature/feed/FeedScreen.kt:369`) : c'est un écart structurel, pas une
  question de timing — contrairement à DEF-013, il ne se corrige pas en naviguant ailleurs.

## 7. Parcours UI — portefeuille, boutique, récompenses, classements, recharge

Passage visuel rapide (écrans déjà validés côté logique serveur par la campagne 3 API) :

| Écran | Résultat | Preuve |
| --- | --- | --- |
| Mon portefeuille (solde, historique, auto-déblocage) | **OK**, rendu correct | `phone-10-wallet.png` |
| Boutique — onglet Pièces | **OK**, bandeau « Simulated billing (test build) » visible | `phone-11-shop.png` |
| Boutique — onglet VIP | **OK** | `phone-12-shop-vip.png` |
| Récompenses — connexion quotidienne + tâches | **OK** | `phone-13/14/15-rewards*.png` |
| Classements (Aujourd'hui / Semaine / Toujours) | **OK** | `phone-16-rankings.png` |
| Fiche série (paywall, épisodes) | **OK** | `phone-17-series-secret-lagon.png` |
| Flux « Pour vous » | **OK** visuellement (voir DEF-014 pour le genre) | `phone-20-foryou.png` |
| Ma liste | **OK** | `phone-21-mylist.png` |
| Lien de recharge mobile money (M-34) | **Toujours masqué** : aucun lien/bouton de recharge externe visible dans Portefeuille, Boutique (Pièces ou VIP) — conforme au drapeau Remote Config désactivé par défaut | `phone-10/11/12` |

Aucune tâche de récompense n'a été réclamée (« Claim ») pour éviter de modifier l'état du compte au-delà du
nécessaire ; le check-in du jour était déjà réclamé par une session précédente (« Day 2 claimed »).

## 8. Actions effectuées sur le compte du propriétaire

- **Aucune déconnexion, aucune suppression de compte.**
- **Aucune pièce dépensée** : solde resté à 900 pièces du début à la fin de la campagne (vérifié par captures
  d'écran successives).
- Langue de l'application basculée Français → English puis remise en **Français** en fin de campagne (confirmé
  par capture finale `phone-24-final-home-fr.png` et le toast « Langue enregistrée »). Cette capture finale montre
  d'ailleurs, par effet de bord, une nouvelle confirmation de DEF-013 en sens inverse : « 2 ép. · **Drama** » reste
  affiché en anglais sur l'Accueil juste après le retour en français, le temps qu'un écran revisite le dictionnaire
  de genres — purement transitoire, sans impact, l'app est bien en français partout ailleurs (titres, boutons,
  navigation).
- Économiseur de données activé puis **désactivé** en fin de campagne (état initial restauré).
- Lecture de l'épisode 3 déjà débloqué de « Le Secret du Lagon » relancée pour le test `FLAG_SECURE` (pas de
  nouveau débit, l'épisode était déjà payé lors d'une session antérieure) ; la lecture s'est terminée naturellement
  (clip de démonstration de 30 s), une ligne de progression a été envoyée au serveur (`completed=true`), sans
  impact fonctionnel.
- Plusieurs `force-stop` / relances de l'application pour les tests DEF-011 et économiseur de données — sans effet
  sur les données du compte.

## 9. Ce qui n'a pas pu être testé

- **Repro exact de la course DEF-011** (deux appelants simultanés au tout premier lancement) : non reproduit à
  l'identique car le jeton FCM de l'appareil est stable depuis plusieurs jours et je n'ai pas pu forcer une
  nouvelle inscription (suppression du fichier de préférences locales bloquée par le classificateur de sécurité de
  l'environnement comme action irréversible ; je n'ai pas cherché à contourner ce refus). Le défaut est refermé
  sur la base du code revu + de l'absence de doublon observée + de la ligne unique en base, mais si le client
  souhaite une preuve dynamique complète du scénario de course exact, cela nécessiterait soit une installation
  fraîche (`pm clear`, hors de question sur le compte réel), soit un compte jetable dédié.
- **Pub récompensée en situation réelle à l'écran** : aucune tâche « regarder une pub » n'était visible dans la
  liste des récompenses à ce moment (les tâches disponibles étaient : épisodes du jour/de la semaine, notifications,
  partage, profil, favoris) ; la logique serveur de la pub récompensée avait déjà été validée par API lors de la
  campagne 3.
- **Déblocage payant réel à l'écran** : aucun épisode verrouillé n'était disponible sur le compte (tout le
  catalogue accessible au propriétaire est déjà gratuit ou déjà débloqué) ; le paywall n'a donc pas pu être
  déclenché visuellement cette campagne. La logique serveur du déblocage a déjà été validée par API (campagne 3).

## 10. Synthèse

| Domaine | Résultat |
| --- | --- |
| DEF-011 (push token ×2) | **Fermé** |
| DEF-012 (puces de genre non traduites — repro original) | **Fermé** |
| Économiseur de données — persistance | **OK** |
| FLAG_SECURE | **OK** (reconfirmé) |
| Portefeuille / Boutique / Récompenses / Classements / Ma liste (UI) | **OK** |
| Lien de recharge (M-34) | **Toujours masqué, conforme** |
| DEF-013 (nouveau, mineur) | **Ouvert** — fraîcheur du cache de genres après changement de langue en session |
| DEF-014 (nouveau, mineur) | **Ouvert** — flux « Pour vous » ne traduit jamais les genres |

**Aucun défaut bloquant ni majeur.** Les deux défauts historiques ciblés par cette campagne (DEF-011, DEF-012)
sont refermés avec preuve. Deux défauts mineurs supplémentaires ont été découverts en creusant au-delà du
périmètre strict de DEF-012 (genre non traduit sur l'Accueil juste après un changement de langue, et jamais
traduit sur le flux « Pour vous ») ; aucun des deux n'est bloquant, mais ils concernent la même famille
fonctionnelle (i18n des genres, S05-A2-03) et méritent un correctif de suivi.

## 11. Recommandation

1. **GO** — DEF-011 et DEF-012 peuvent être considérés comme livrés et vérifiés.
2. Corriger DEF-013 (Accueil) et DEF-014 (Pour vous) dans un prochain sprint i18n ; DEF-014 est le plus simple à
   corriger (faire passer `FeedScreen.kt` par `GenreLabels`/`GenresRepository` comme les autres écrans) ; DEF-013
   nécessite de déclencher un `genres.refresh(force = true)` au moment du changement de langue plutôt que de
   compter sur la prochaine navigation pour rafraîchir le cache partagé.
3. Si une preuve dynamique complète du scénario de course DEF-011 (vs. preuve statique + absence de doublon) est
   jugée nécessaire par le client, prévoir un compte jetable dédié pour une installation fraîche lors d'une
   prochaine campagne.
