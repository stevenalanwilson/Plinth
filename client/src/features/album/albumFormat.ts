const GENERAL_REGIONS: Readonly<Record<string, string>> = {
  XW: 'Worldwide',
  XE: 'Europe',
};

/** "1980" stays; "1980-11" becomes "November 1980"; "1980-11-21" becomes "21 November 1980". */
export function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split('-');
  if (!month) return date;

  const monthIndex = Number(month) - 1;
  if (!/^\d{4}$/.test(year) || !(monthIndex >= 0 && monthIndex <= 11)) return date;

  // UTC, so the date doesn't shift a day or a month in the viewer's time zone.
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(year), monthIndex, 1)),
  );
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
}

/** A MusicBrainz country code as a name: "GB" becomes "United Kingdom". */
export function formatCountry(code: string): string {
  const general = GENERAL_REGIONS[code];
  if (general) return general;
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code) ?? code;
  } catch {
    // An invalid code makes Intl throw; showing it as given is better than showing nothing.
    return code;
  }
}

export function formatTrackLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
