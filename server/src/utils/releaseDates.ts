// A date can be "1980", "1980-11" or "1980-11-21". A year alone means "sometime in 1980", so it
// sorts as the end of the year: otherwise a French release dated just "1980" would beat the
// UK pressing of November 1980.
export function sortableDate(date: string | undefined): string {
  if (!date) return '9999-99-99';
  const [year, month = '99', day = '99'] = date.split('-');
  return `${year}-${month}-${day}`;
}
