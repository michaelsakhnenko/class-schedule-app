export const SOURCE_PLAN_URL = "https://harmonogram.krakow.ideis.pl/Plany/PlanyTokow/1000";

/**
 * @typedef {Object} ClassEvent
 * @property {string} id
 * @property {string} date - YYYY-MM-DD, interpreted in Europe/Warsaw
 * @property {string} startTime - HH:mm local time
 * @property {string} endTime - HH:mm local time
 * @property {string} title
 * @property {"lecture" | "exercise" | "seminar" | "other"} type
 * @property {string} [typeLabel] - Original source label when the form is not yet mapped
 * @property {string} group
 * @property {string} room
 * @property {string} instructor
 * @property {string} notes
 * @property {string} sourceUrl
 */

export const CLASS_TYPES = {
  lecture: { label: "Wykład", short: "Wyk" },
  exercise: { label: "Ćwiczenia", short: "Ćw" },
  seminar: { label: "Konwersatorium", short: "Konw" },
  other: { label: "Inne", short: "Inne" },
};

export function getEventType(event) {
  return Object.hasOwn(CLASS_TYPES, event.type) ? event.type : "other";
}

export function getEventTypeLabel(event) {
  const type = getEventType(event);
  return type === "other" && event.typeLabel?.trim() ? event.typeLabel.trim() : CLASS_TYPES[type].label;
}

export function isLanguageGroup(group) {
  return /^\d+\s+ang(?:Now|Prad)\b/i.test(group);
}

export function getLanguageGroups(events) {
  return [...new Set(events.map((event) => event.group).filter(isLanguageGroup))]
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

export function formatLanguageGroup(group) {
  const level = /\s([A-C]\d\+?)(?:\/|$)/i.exec(group)?.[1];
  if (!level) return group;
  return level === "B2+" ? "B2" : level;
}

export function filterByLanguageGroup(events, selectedGroup) {
  if (!selectedGroup) return events;
  return events.filter((event) => !isLanguageGroup(event.group) || event.group === selectedGroup);
}

export async function getSchedule() {
  const response = await fetch(`${import.meta.env.BASE_URL}schedule.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load schedule (${response.status}).`);
  const snapshot = await response.json();
  if (snapshot.planId !== "1000" || !Array.isArray(snapshot.events)) throw new Error("Invalid schedule snapshot.");
  return snapshot.events;
}
