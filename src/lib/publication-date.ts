const publicationCalendar = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function publicationDate(now = new Date()): string {
  return publicationCalendar.format(now);
}

// Numeric YYYYMMDD allows the search index to filter dates without parsing
// timestamps or depending on the server's local timezone.
export function publicationDay(date = publicationDate()): number {
  return Number(date.replaceAll("-", ""));
}
