import { DateTime } from 'luxon';

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(cents / 100);

/** UTC ISO zamanı, verilen zaman diliminde okunur biçimde gösterir */
export const formatDateTime = (iso: string, tz: string) =>
  DateTime.fromISO(iso).setZone(tz).setLocale('tr').toFormat('d MMMM yyyy, cccc • HH:mm');

export const todayIn = (tz: string) => DateTime.now().setZone(tz).toISODate()!;

export const userTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';
