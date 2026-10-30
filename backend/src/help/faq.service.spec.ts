import { type FaqEntry } from '../generated/prisma/client.js';
import { FaqService, localize } from './faq.service.js';

function entry(partial: Partial<FaqEntry>): FaqEntry {
  return {
    id: 'f1',
    category: 'coins',
    question: { fr: 'Q fr', en: 'Q en' },
    answer: { fr: 'A fr' },
    position: 0,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('FAQ i18n (M-53)', () => {
  it('localize falls back to French, then to any available text', () => {
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello');
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'es')).toBe('Bonjour');
    expect(localize({ pt: 'Olá' }, 'fr')).toBe('Olá');
    expect(localize(null, 'fr')).toBe('');
  });

  it('groups published entries by category in the canonical order with localized titles', () => {
    const grouped = FaqService.group(
      [
        entry({ id: 'f2', category: 'other', position: 1, question: { fr: 'Autre ?' } }),
        entry({ id: 'f1', category: 'coins', position: 0 }),
        entry({
          id: 'f3',
          category: 'account',
          position: 2,
          question: { fr: 'Compte ?', pt: 'Conta?' },
        }),
      ],
      'en',
    );
    expect(grouped.categories.map((c) => c.key)).toEqual(['account', 'coins', 'other']);
    expect(grouped.categories[0]).toMatchObject({
      title: 'Account',
      entries: [{ id: 'f3', question: 'Compte ?', answer: 'A fr' }],
    });
    expect(grouped.categories[1].title).toBe('Coins');
    expect(grouped.categories[1].entries[0]).toEqual({
      id: 'f1',
      question: 'Q en',
      answer: 'A fr',
    });
  });
});
