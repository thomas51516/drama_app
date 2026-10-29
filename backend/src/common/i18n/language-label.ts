/** Noms des langues tels qu'affichés dans le sélecteur de sous-titres (nom dans la langue elle-même). */
const LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  it: 'Italiano',
  ar: 'العربية',
  sw: 'Kiswahili',
  ha: 'Hausa',
  yo: 'Yorùbá',
  wo: 'Wolof',
  ln: 'Lingála',
};

/** Libellé d'une langue de sous-titres (ISO 639-1) : table ci-dessus, puis ICU, puis le code. */
export function languageLabel(code: string): string {
  const normalized = code.trim().toLowerCase();
  const base = normalized.split('-')[0] ?? normalized;
  const known = LABELS[base];
  if (known) return known;
  try {
    const name = new Intl.DisplayNames([base], { type: 'language' }).of(base);
    if (name && name.toLowerCase() !== base) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Étiquette inconnue d'ICU : on retombe sur le code.
  }
  return code.toUpperCase();
}
