/**
 * Safely parses a datetime string from the API.
 * Since the API stores datetime objects as naive UTC datetimes in SQLite,
 * they are serialized without timezone offset information (e.g. YYYY-MM-DDTHH:MM:SS).
 * This function appends "Z" if no timezone information is present,
 * ensuring Javascript parses it as UTC and correctly formats it to local time.
 */
export function parseUTCDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(NaN);
  
  // Check if string already has timezone specifier:
  // e.g. "Z", "+00:00", "-0500" etc.
  const hasTimezone = /Z|[+-]\d{2}:?\d{2}$/.test(dateStr);
  return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
}

/**
 * Formats a UTC datetime string into a local date/time string.
 */
export function formatLocalDateTime(dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = parseUTCDate(dateStr);
  if (isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", options || { hour12: false });
}
