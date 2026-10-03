export const SCHEDULE_TIME_ZONE = "Europe/Warsaw";

export function todayISO() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseDay(day) {
  return new Date(`${day}T12:00:00Z`);
}

export function isWeekend(day) {
  const weekday = parseDay(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day, amount) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return toISO(date);
}

export function startOfWeek(day) {
  const weekday = parseDay(day).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function weekDays(day) {
  const monday = startOfWeek(day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthDays(day) {
  const date = parseDay(day);
  const first = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const start = startOfWeek(first);
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = Math.round((parseDay(first) - parseDay(start)) / 86400000);
  const count = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function formatMonth(day) {
  const value = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseDay(day));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatWeekday(day, long = false) {
  return new Intl.DateTimeFormat("pl-PL", { weekday: long ? "long" : "short", timeZone: "UTC" }).format(parseDay(day));
}

export function formatFullDate(day) {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parseDay(day));
}

export function formatShortDate(day) {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parseDay(day));
}

export function classCountLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return "zajęcie";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "zajęcia";
  return "zajęć";
}

export function formatDateRange(days) {
  const first = parseDay(days[0]);
  const last = parseDay(days[days.length - 1]);
  const month = new Intl.DateTimeFormat("pl-PL", { month: "short", timeZone: "UTC" });
  return `${first.getUTCDate()} ${month.format(first)} – ${last.getUTCDate()} ${month.format(last)}`;
}

export function minutes(time) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export function currentWarsawTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { hour, minute };
}
