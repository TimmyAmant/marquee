// The fictional slate every landing-page screenshot shows. Nothing here is a
// real film, show, person or service. Edit this file, then re-run render.mjs.

export const emberline = {
  title: 'Emberline',
  year: '2025',
  kind: 'movie',
  runtime: '2h 21m',
  genres: ['Science Fiction', 'Adventure'],
  score: 84,
  status: 'Released',
  releaseDate: 'March 14, 2025',
  originalLanguage: 'English',
  productionCountry: { flag: '🇬🇧', name: 'United Kingdom' },
  tagline: 'Follow the light.',
  overview:
    'When the orbital mirrors that keep the ice colony of Hollis alive begin to fail, salvage pilot Kestrel Moor and a disgraced engineer set out across four hundred miles of frozen sea to reach the last working relay — carrying the only map that can relight the world, and a secret about who put it out.',
  credits: [
    { name: 'Ines Varga', role: 'Director' },
    { name: 'Callum Reyes-Whitby', role: 'Screenplay' },
  ],
  keywords: ['frozen planet', 'orbital mirror', 'expedition', 'survival', 'found family', 'lighthouse'],
  cast: [
    { name: 'Aurelio Vance', character: 'Kestrel Moor' },
    { name: 'Nadia Oyelaran', character: 'Dr. Ilse Maren' },
    { name: 'Signe Halvorsen', character: 'Cmdr. Petra Lund' },
    { name: 'Tomás Ibarra', character: 'Rook' },
    { name: 'Jun-seo Bae', character: 'Ansel' },
    { name: 'Priya Raman-Clarke', character: 'Tamsin Hale' },
  ],
  // Original marks drawn in placeholders.mjs; no real services.
  providers: ['Lumen+', 'Reelhouse', 'Northlight'],
  file: {
    path: '/mnt/user/media/movies/Emberline (2025)/Emberline (2025) Bluray-2160p.mkv',
    cells: [
      ['Size', '58.7 GB'],
      ['Runtime', '2h 21m'],
      ['Added', '4/2/2025'],
      ['Resolution', '4K'],
      ['Quality profile', 'Bluray-2160p'],
      ['Video', 'x265'],
      ['Dynamic range', 'DV HDR10'],
      ['Audio', 'TrueHD Atmos 7.1ch'],
    ],
  },
};

export const paperHarbor = {
  title: 'Paper Harbor',
  year: '2024',
  kind: 'movie',
  genres: ['Drama', 'Romance'],
  tagline: 'Some words always find their way home.',
};

export const holloway = {
  title: 'Holloway Picture House',
  year: '2023–',
  kind: 'tv',
  genres: ['Comedy', 'Drama'],
  logline: "Three estranged siblings inherit their late father's crumbling single-screen cinema, and one summer to save it.",
};

// Who is signed in on the screenshots, and the server they're on.
export const viewer = { name: 'Jordan', host: 'marquee.local' };
