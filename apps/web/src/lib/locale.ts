/** One place for the interface's date and number formats: English (24 h clock, day before month), Istanbul time. */
export const LOCALE = 'en-GB';
export const TZ = 'Europe/Istanbul';

const at = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));
export const time = (d: Date | string | number, seconds = false) =>
  at(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false, timeZone: TZ });
export const dayMonth = (d: Date | string | number) => at(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone: TZ });
export const day = (d: Date | string | number) => at(d).toLocaleDateString(LOCALE, { timeZone: TZ });
export const dateTime = (d: Date | string | number) => `${dayMonth(d)} ${time(d)}`;
export const fullDateTime = (d: Date | string | number) => at(d).toLocaleString(LOCALE, { timeZone: TZ, hour12: false });
export const int = (n: number) => n.toLocaleString(LOCALE);
export const decimal = (n: number, digits = 1) => n.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
