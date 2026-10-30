import { type SupportedLanguage } from '../common/i18n/accept-language.js';
import { type RewardTaskKey } from './dto/rewards.dto.js';

type Localized = Record<SupportedLanguage, string>;

/** Libellés des tâches du MVP (M-41) ; montants, cibles et activation vivent dans `reward_tasks` (B-08). */
export const REWARD_TASK_TEXTS: Record<
  RewardTaskKey,
  { title: Localized; description: Localized }
> = {
  watch_3_episodes: {
    title: {
      fr: 'Regarder 3 épisodes aujourd’hui',
      en: 'Watch 3 episodes today',
      es: 'Ver 3 episodios hoy',
      pt: 'Assistir 3 episódios hoje',
    },
    description: {
      fr: 'Terminez 3 épisodes dans la journée.',
      en: 'Finish 3 episodes within the day.',
      es: 'Termina 3 episodios en el día.',
      pt: 'Termine 3 episódios no dia.',
    },
  },
  watch_10_episodes: {
    title: {
      fr: 'Regarder 10 épisodes cette semaine',
      en: 'Watch 10 episodes this week',
      es: 'Ver 10 episodios esta semana',
      pt: 'Assistir 10 episódios esta semana',
    },
    description: {
      fr: 'Terminez 10 épisodes du lundi au dimanche.',
      en: 'Finish 10 episodes from Monday to Sunday.',
      es: 'Termina 10 episodios de lunes a domingo.',
      pt: 'Termine 10 episódios de segunda a domingo.',
    },
  },
  enable_notifications: {
    title: {
      fr: 'Activer les notifications',
      en: 'Turn on notifications',
      es: 'Activar las notificaciones',
      pt: 'Ativar as notificações',
    },
    description: {
      fr: 'Autorisez les notifications pour ne manquer aucun nouvel épisode.',
      en: 'Allow notifications so you never miss a new episode.',
      es: 'Permite las notificaciones para no perderte ningún episodio nuevo.',
      pt: 'Permita as notificações para não perder nenhum episódio novo.',
    },
  },
  share_series: {
    title: {
      fr: 'Partager une série',
      en: 'Share a series',
      es: 'Compartir una serie',
      pt: 'Compartilhar uma série',
    },
    description: {
      fr: 'Envoyez le lien d’une série à un ami.',
      en: 'Send a series link to a friend.',
      es: 'Envía el enlace de una serie a un amigo.',
      pt: 'Envie o link de uma série para um amigo.',
    },
  },
  complete_profile: {
    title: {
      fr: 'Compléter votre profil',
      en: 'Complete your profile',
      es: 'Completar tu perfil',
      pt: 'Completar o seu perfil',
    },
    description: {
      fr: 'Renseignez votre nom, votre langue et votre pays.',
      en: 'Fill in your name, language and country.',
      es: 'Indica tu nombre, idioma y país.',
      pt: 'Preencha o seu nome, idioma e país.',
    },
  },
  add_favorite: {
    title: {
      fr: 'Ajouter une série aux favoris',
      en: 'Add a series to favorites',
      es: 'Añadir una serie a favoritos',
      pt: 'Adicionar uma série aos favoritos',
    },
    description: {
      fr: 'Suivez une série pour être prévenu des nouveaux épisodes.',
      en: 'Follow a series to be told about new episodes.',
      es: 'Sigue una serie para enterarte de los nuevos episodios.',
      pt: 'Siga uma série para saber dos novos episódios.',
    },
  },
};

export function taskText(
  key: string,
  lang: SupportedLanguage,
): { title: string; description: string } {
  const texts = REWARD_TASK_TEXTS[key as RewardTaskKey];
  if (!texts) return { title: key, description: '' };
  return {
    title: texts.title[lang] ?? texts.title.fr,
    description: texts.description[lang] ?? texts.description.fr,
  };
}
