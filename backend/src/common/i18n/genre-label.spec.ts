import { canonicalGenre, genreLabel, KNOWN_GENRES } from './genre-label.js';

describe('genre labels (DEF-012)', () => {
  it('localizes the known genres in the four languages', () => {
    expect(KNOWN_GENRES).toHaveLength(7);
    expect(genreLabel('drame', 'fr')).toBe('Drame');
    expect(genreLabel('drame', 'en')).toBe('Drama');
    expect(genreLabel('comédie', 'es')).toBe('Comedia');
    expect(genreLabel('fantastique', 'pt')).toBe('Fantasia');
  });

  it('accepts aliases and falls back to a capitalized key', () => {
    expect(canonicalGenre('Comedy')).toBe('comédie');
    expect(genreLabel('comedie', 'en')).toBe('Comedy');
    expect(genreLabel('western', 'en')).toBe('Western');
  });
});
