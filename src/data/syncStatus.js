const WORKFLOW_API = "https://api.github.com/repos/michaelsakhnenko/class-schedule-app/actions/workflows/sync-schedule.yml/runs?per_page=5";
const DELAY_MS = 95 * 60 * 1000;

export async function getSyncHeartbeat() {
  const response = await fetch(`${import.meta.env.BASE_URL}sync-status.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load sync status (${response.status}).`);
  const status = await response.json();
  if (status.planId !== "1000" || !Number.isFinite(Date.parse(status.checkedAt))) {
    throw new Error("Invalid sync status.");
  }
  return status;
}

export async function getLatestWorkflowRun() {
  const response = await fetch(WORKFLOW_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Could not load workflow history (${response.status}).`);
  const payload = await response.json();
  return payload.workflow_runs?.[0] ?? null;
}

export function assessSyncStatus(heartbeat, latestRun, now = Date.now()) {
  if (!heartbeat) return "unknown";
  const checkedAt = Date.parse(heartbeat.checkedAt);
  if (!Number.isFinite(checkedAt)) return "unknown";
  const runStarted = Date.parse(latestRun?.created_at);
  if (Number.isFinite(runStarted) && runStarted > checkedAt) {
    if (latestRun.conclusion === "failure" || latestRun.conclusion === "cancelled" || latestRun.conclusion === "timed_out") return "failed";
    if (latestRun.status !== "completed") return "running";
  }
  return now - checkedAt > DELAY_MS ? "delayed" : "current";
}

export function formatSyncTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
