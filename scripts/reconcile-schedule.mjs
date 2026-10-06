function sessionKey(event) {
  return [event.date, event.title, event.group, event.type].join("\u0000");
}

/** Keep withdrawn sessions visible while treating edits to the same session as updates. */
export function reconcileSchedule(previousEvents, importedEvents, start, end) {
  const importedIds = new Set(importedEvents.map((event) => event.id));
  const importedCounts = new Map();
  const previousGroups = new Map();

  for (const event of importedEvents) {
    const key = sessionKey(event);
    importedCounts.set(key, (importedCounts.get(key) ?? 0) + 1);
  }

  const preserved = [];
  for (const event of previousEvents) {
    if (event.date < start || event.date > end) {
      preserved.push(event);
      continue;
    }
    const key = sessionKey(event);
    if (!previousGroups.has(key)) previousGroups.set(key, []);
    previousGroups.get(key).push(event);
  }

  for (const [key, previousGroup] of previousGroups) {
    const withdrawnCount = Math.max(0, previousGroup.length - (importedCounts.get(key) ?? 0));
    if (!withdrawnCount) continue;
    const missing = previousGroup.filter((event) => !importedIds.has(event.id));
    missing.sort((a, b) => Number(b.status === "cancelled") - Number(a.status === "cancelled"));
    preserved.push(...missing.slice(0, withdrawnCount).map((event) => ({ ...event, status: "cancelled" })));
  }

  return [...importedEvents, ...preserved].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.group.localeCompare(b.group) || a.title.localeCompare(b.title)
  );
}
