import { describe, expect, it } from 'vitest'
import { escapeHtml, renderInline, renderMarkdown, slugify } from '../utils/markdown'
import guide from '../../../docs/guide-back-office.md?raw'

describe('markdown renderer (help page)', () => {
  it('escapes HTML and renders inline markup', () => {
    expect(escapeHtml('<b a="1">&\'')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&#39;')
    expect(renderInline(escapeHtml('**fort** et *léger* avec `code` et [lien](https://x.y)'))).toBe(
      '<strong>fort</strong> et <em>léger</em> avec <code>code</code> et <a href="https://x.y" target="_blank" rel="noopener noreferrer">lien</a>',
    )
    // Unsafe schemes are dropped, text kept.
    expect(renderInline(escapeHtml('[x](javascript:void)'))).toBe('x')
    expect(renderInline(escapeHtml('`<script>`'))).toBe('<code>&lt;script&gt;</code>')
  })

  it('slugifies headings with accents and keeps ids unique', () => {
    const taken = new Set<string>()
    expect(slugify('Connexion et double authentification', taken)).toBe(
      'connexion-et-double-authentification',
    )
    expect(slugify('Épisodes et upload', taken)).toBe('episodes-et-upload')
    expect(slugify('Épisodes et upload', taken)).toBe('episodes-et-upload-2')
    expect(slugify('***', taken)).toBe('section')
  })

  it('renders headings, lists, quotes, tables and code blocks', () => {
    const { html, headings } = renderMarkdown(
      [
        '# Titre',
        '',
        'Un paragraphe',
        'sur deux lignes.',
        '',
        '## Section A',
        '',
        '- un',
        '- deux',
        '  - sous',
        '',
        '1. premier',
        '2. second',
        '',
        '> citation **forte**',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '```',
        'npm run <x>',
        '```',
        '',
        '---',
        '',
        '### Sous-section',
      ].join('\n'),
    )
    expect(headings).toEqual([
      { level: 1, id: 'titre', text: 'Titre' },
      { level: 2, id: 'section-a', text: 'Section A' },
      { level: 3, id: 'sous-section', text: 'Sous-section' },
    ])
    expect(html).toContain('<h1 id="titre">Titre</h1>')
    expect(html).toContain('<p>Un paragraphe sur deux lignes.</p>')
    const compact = html.replace(/\n/g, '')
    expect(compact).toContain('<ul><li>un</li><li>deux<ul><li>sous</li></ul></li></ul>')
    expect(compact).toContain('<ol><li>premier</li><li>second</li></ol>')
    expect(html).toContain('<blockquote><p>citation <strong>forte</strong></p></blockquote>')
    expect(html).toContain(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    )
    expect(html).toContain('<pre><code>npm run &lt;x&gt;</code></pre>')
    expect(html).toContain('<hr />')
    expect(html).not.toMatch(
      /<(?!\/?(h[1-6]|p|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|hr|strong|em|a)\b)/,
    )
  })

  it('renders the bundled back-office guide with the expected chapters', () => {
    const { headings, html } = renderMarkdown(guide)
    const chapters = headings
      .filter((heading) => heading.level === 2)
      .map((heading) => heading.text)
    expect(chapters).toEqual([
      'Connexion et double authentification',
      'Séries (catalogue)',
      'Épisodes et upload',
      'Sous-titres',
      'Mise en avant (accueil de l’application)'.replace('’', "'"),
      'Planification des sorties',
      'Tableau de bord',
      'Comptes internes et journal d’audit'.replace('’', "'"),
      'Appareil de confiance (connexion sans code pendant 30 jours)',
      'Monétisation (paramètres, packs, formules VIP)',
      'Récompenses (check-in)',
      'Utilisateurs (support)',
      'Notifications push (campagnes)',
      'Centre d’aide (FAQ et support)'.replace('’', "'"),
      'Erreurs fréquentes',
    ])
    expect(html).toContain('<table>')
    expect(html).not.toContain('<script')
  })
})
