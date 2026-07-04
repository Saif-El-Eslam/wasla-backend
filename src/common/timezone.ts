export const defaultVenueTimezone = 'Africa/Cairo';

export function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );

  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  for (let index = 0; index < 3; index += 1) {
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      timeZoneOffsetMs(new Date(utcMs), timeZone);
  }

  return new Date(utcMs);
}

export function startOfDayInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, parts.day);
}

export function endOfDayInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, parts.day, 23, 59, 59, 999);
}

export function startOfMonthInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month, 1);
}

export function endOfMonthInZone(timeZone: string, date = new Date()) {
  const parts = zonedParts(date, timeZone);
  return zonedDateTimeToUtc(timeZone, parts.year, parts.month + 1, 0, 23, 59, 59, 999);
}

export function monthKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function dayKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function weekKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const localDayAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const first = new Date(Date.UTC(parts.year, 0, 1));
  const days = Math.floor((localDayAsUtc - first.getTime()) / 86400000);
  return `${parts.year}-W${String(Math.ceil((days + first.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
}

export function localDateTimeLabel(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
