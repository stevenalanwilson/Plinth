/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The albums as a sentence, in order: "Nevermind by Nirvana, Abbey Road by The Beatles and …". */
export function describeAlbums(albums: readonly { album: string; artist: string }[]): string {
  if (albums.length === 0) return '';
  return `${joinNames(albums.map(({ album, artist }) => `${album} by ${artist}`))}.`;
}
