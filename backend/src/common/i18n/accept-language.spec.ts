import { normalizeCountry, pickLanguage } from './accept-language.js';
import { languageLabel } from './language-label.js';

describe('pickLanguage', () => {
  it('defaults to fr without a header', () => {
    expect(pickLanguage(undefined)).toBe('fr');
    expect(pickLanguage('')).toBe('fr');
  });

  it('honours q-weights and regional tags', () => {
    expect(pickLanguage('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
    expect(pickLanguage('de-DE,de;q=0.9,pt-BR;q=0.8,en;q=0.7')).toBe('pt');
    expect(pickLanguage('es;q=0.5, fr;q=0.9')).toBe('fr');
    expect(pickLanguage('fr;q=0, en;q=0.1')).toBe('en');
  });

  it('falls back to fr for unsupported languages or wildcard', () => {
    expect(pickLanguage('de,it;q=0.8')).toBe('fr');
    expect(pickLanguage('*')).toBe('fr');
  });
});

describe('normalizeCountry', () => {
  it('uppercases valid ISO codes and rejects anything else', () => {
    expect(normalizeCountry('tg')).toBe('TG');
    expect(normalizeCountry(' CI ')).toBe('CI');
    expect(normalizeCountry('France')).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
  });
});

describe('languageLabel', () => {
  it('returns the language name in its own language', () => {
    expect(languageLabel('fr')).toBe('Français');
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('pt-BR')).toBe('Português');
    expect(languageLabel('de')).toBe('Deutsch');
  });

  it('falls back to the upper-cased code for unknown tags', () => {
    expect(languageLabel('zz')).toBe('ZZ');
  });
});
