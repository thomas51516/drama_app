import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from '../common/i18n/accept-language.js';

type Texts = Record<SupportedLanguage, { title: string; body: string }>;

const NEW_EPISODE: Record<
  SupportedLanguage,
  (series: string, n: number) => Texts[SupportedLanguage]
> = {
  fr: (s, n) => ({ title: `Nouvel épisode de ${s}`, body: `L’épisode ${n} est disponible.` }),
  en: (s, n) => ({ title: `New episode of ${s}`, body: `Episode ${n} is now available.` }),
  es: (s, n) => ({ title: `Nuevo episodio de ${s}`, body: `El episodio ${n} ya está disponible.` }),
  pt: (s, n) => ({ title: `Novo episódio de ${s}`, body: `O episódio ${n} já está disponível.` }),
};

const SUPPORT_REPLY: Record<SupportedLanguage, string> = {
  fr: 'Réponse du support',
  en: 'Reply from support',
  es: 'Respuesta del soporte',
  pt: 'Resposta do suporte',
};

export function languageOf(value: string | null | undefined): SupportedLanguage {
  const base = (value ?? '').toLowerCase().split('-')[0] ?? '';
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}

export function newEpisodeTexts(language: string | null | undefined, series: string, n: number) {
  return NEW_EPISODE[languageOf(language)](series, n);
}

export function supportReplyTexts(language: string | null | undefined, message: string) {
  const excerpt = message.replace(/\s+/g, ' ').trim();
  return {
    title: SUPPORT_REPLY[languageOf(language)],
    body: excerpt.length > 140 ? `${excerpt.slice(0, 139)}…` : excerpt,
  };
}
