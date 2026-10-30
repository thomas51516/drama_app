import { escapeLike, normalizeSearchText, prepareSearch } from './search-query.js';

describe('prepareSearch', () => {
  it('normalises accents and case and builds a prefix tsquery', () => {
    const prepared = prepareSearch('  Héritage   Lomé ');
    expect(prepared.text).toBe('heritage lome');
    expect(prepared.terms).toEqual(['heritage', 'lome']);
    expect(prepared.prefixQuery).toBe('heritage:* & lome:*');
    expect(prepared.likePrefix).toBe('heritage lome');
  });

  it('drops punctuation from tsquery terms and escapes LIKE wildcards', () => {
    const prepared = prepareSearch("l'amour 100% _vrai_");
    expect(prepared.terms).toEqual(['l', 'amour', '100', 'vrai']);
    expect(prepared.prefixQuery).toBe('l:* & amour:* & 100:* & vrai:*');
    expect(prepared.likePrefix).toBe("l'amour 100\\% \\_vrai\\_");
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('caps the number of terms and yields an empty prefix query without alphanumerics', () => {
    expect(prepareSearch('a b c d e f g h i j').terms).toHaveLength(8);
    expect(prepareSearch('!!! ???').prefixQuery).toBe('');
    expect(normalizeSearchText('ÀÉÎÕÜ')).toBe('aeiou');
  });
});
