// Local correction for the exact source row; stop overriding if IDEIS changes it.
const SALES_DYNAMICS_EXERCISE = {
  id: "5711e93d07af8d4710ef",
  date: "2026-10-28",
  title: "Zarządzanie sprzedażą z MS Dynamics",
  type: "exercise",
  group: "cw/3/ZS",
  startTime: "15:15",
  endTime: "16:45",
};

export function applyScheduleOverrides(events) {
  return events.map((event) =>
    Object.entries(SALES_DYNAMICS_EXERCISE).every(([key, value]) => event[key] === value)
      ? { ...event, startTime: "11:45", endTime: "13:15" }
      : event
  );
}
