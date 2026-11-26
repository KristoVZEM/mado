/** Los 19 géneros fijos de AniList en español. La Ficha enseña los de la fuente, ya en español; estos son para filtrar. */
const EN_ESPANOL: Readonly<Record<string, string>> = {
  Action: 'Acción',
  Adventure: 'Aventura',
  Comedy: 'Comedia',
  Drama: 'Drama',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasía',
  Hentai: 'Hentai',
  Horror: 'Terror',
  'Mahou Shoujo': 'Mahō shōjo',
  Mecha: 'Mecha',
  Music: 'Música',
  Mystery: 'Misterio',
  Psychological: 'Psicológico',
  Romance: 'Romance',
  'Sci-Fi': 'Ciencia ficción',
  'Slice of Life': 'Recuentos de la vida',
  Sports: 'Deportes',
  Supernatural: 'Sobrenatural',
  Thriller: 'Suspense',
};

/** Nombre en español; si AniList añade uno que no está en la tabla, se enseña tal cual. */
export function generoEnEspanol(genero: string): string {
  return Object.hasOwn(EN_ESPANOL, genero) ? EN_ESPANOL[genero] : genero;
}
