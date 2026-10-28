/** Slug URL dérivé du titre (contrat admin : « le slug est dérivé du titre à la création »). */
export function slugify(input: string, maxLength = 140): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || 'series';
}
