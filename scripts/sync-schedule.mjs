#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { reconcileSchedule } from "./reconcile-schedule.mjs";

const PLAN_ID = "1000";
const SOURCE_URL = `https://harmonogram.krakow.ideis.pl/Plany/PlanyTokow/${PLAN_ID}`;
const OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/schedule.json");
const STATUS_OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/sync-status.json");
const FORM_TYPES = { Wyk: "lecture", Cw: "exercise", Konw: "seminar" };

function polishDateToISO(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unexpected source date: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Unexpected source time: ${value}`);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function makeId(row) {
  const key = [PLAN_ID, row.date, row.startTime, row.endTime, row.group, row.title, row.sourceForm, row.launchId, row.room].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 20);
}

function normalize(row) {
  const type = FORM_TYPES[row.sourceForm] ?? "other";
  const startTime = normalizeTime(row.startTime);
  const endTime = normalizeTime(row.endTime);
  const event = {
    id: makeId({ ...row, startTime, endTime }),
    date: row.date,
    startTime,
    endTime,
    title: row.title,
    type,
    group: row.group,
    room: row.room || "Miejsce niepodane",
    instructor: row.instructor || "Prowadzący niepodany",
    notes: "",
    sourceUrl: SOURCE_URL,
  };
  if (type === "other") event.typeLabel = row.sourceForm;
  return event;
}

function validate(rows, events, start, end) {
  if (!rows.length) throw new Error("The full-semester timetable returned no class rows.");
  if (rows.length !== events.length) throw new Error("Some source rows were not normalized.");
  if (new Set(events.map((event) => event.id)).size !== events.length) throw new Error("Duplicate event IDs in source data.");
  const semesterDays = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const classDays = new Set(events.map((event) => event.date)).size;
  if (semesterDays >= 60 && classDays < Math.max(6, Math.floor(semesterDays / 10))) {
    throw new Error(`The full-semester grid contains classes on only ${classDays} dates across ${semesterDays} days. Refusing to publish a likely partial grid.`);
  }
  for (const event of events) {
    if (event.date < start || event.date > end) throw new Error(`Class outside selected semester: ${event.id}`);
    if (!/^\d{2}:\d{2}$/.test(event.startTime) || !/^\d{2}:\d{2}$/.test(event.endTime) || event.endTime <= event.startTime) throw new Error(`Invalid class time: ${event.id}`);
    if (!event.title || !event.group) throw new Error(`Incomplete class row: ${event.id}`);
  }
}

function validateCoverage(imported, previous, start, end) {
  if (previous?.sourceRange?.start !== start || previous?.sourceRange?.end !== end) return;
  const previousCount = previous.events.filter((event) => event.status !== "cancelled" && event.date >= start && event.date <= end).length;
  if (previousCount >= 20 && imported.length < previousCount * 0.6) {
    throw new Error(`The full-semester grid returned only ${imported.length} classes; the previous snapshot had ${previousCount}. Keeping the published snapshot until the source can be checked.`);
  }
}

async function readPrevious() {
  try { return JSON.parse(await readFile(OUTPUT, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeSyncStatus(checkedAt, changedAt, start, end, sourceRows) {
  const status = {
    planId: PLAN_ID,
    checkedAt,
    changedAt,
    sourceRange: { start, end },
    sourceRows,
  };
  const temporary = `${STATUS_OUTPUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(temporary, STATUS_OUTPUT);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let rows;
  let start;
  let end;
  try {
    const page = await browser.newPage({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    const rejectCookies = page.getByRole("button", { name: "Odrzuć opcjonalne" });
    if (await rejectCookies.isVisible().catch(() => false)) await rejectCookies.click();
    await page.getByRole("radio", { name: "Cały semestr" }).click();

    const selectedDates = await page.locator("input").evaluateAll((inputs) =>
      inputs.map((input) => input.value).filter((value) => /^\d{2}\.\d{2}\.\d{4}$/.test(value))
    );
    if (selectedDates.length !== 2) throw new Error(`Expected two semester dates, found ${selectedDates.length}.`);
    [start, end] = selectedDates.map(polishDateToISO);

    const grid = page.locator("#gridViewPlanyTokow_DXMainTable");
    const previousGrid = await grid.evaluate((table) => table.innerHTML);
    const gridResponse = page.waitForResponse((response) =>
      response.url().includes(`/Plany/PlanyTokowGridCustom/${PLAN_ID}`) && response.request().method() === "POST",
      { timeout: 45000 }
    );
    await page.getByRole("link", { name: "Szukaj" }).click();
    if (!(await gridResponse).ok()) throw new Error("The timetable grid request failed.");
    await page.waitForFunction((oldGrid) => {
      const table = document.querySelector("#gridViewPlanyTokow_DXMainTable");
      return table && table.innerHTML !== oldGrid && table.querySelector('[id^="gridViewPlanyTokow_DXDataRow"]');
    }, previousGrid, { timeout: 45000 });

    rows = await grid.evaluate((table) => {
      let date = null;
      const result = [];
      for (const row of table.querySelectorAll("tr")) {
        const dateMatch = /Data Zajęć:\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(row.innerText);
        if (dateMatch && !row.id.startsWith("gridViewPlanyTokow_DXDataRow")) {
          date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          continue;
        }
        if (!row.id.startsWith("gridViewPlanyTokow_DXDataRow")) continue;
        if (!date || row.cells.length < 11) throw new Error("Unexpected timetable row structure.");
        const cells = Array.from(row.cells, (cell) => cell.innerText.trim());
        result.push({
          date,
          startTime: cells[1],
          endTime: cells[2],
          group: cells[4],
          title: cells[5],
          sourceForm: cells[6],
          room: cells[7],
          instructor: cells[8],
          launchId: cells[10],
        });
      }
      return result;
    });
  } finally {
    await browser.close();
  }

  const imported = rows.map(normalize);
  validate(rows, imported, start, end);
  const previous = await readPrevious();
  validateCoverage(imported, previous, start, end);
  const events = reconcileSchedule(previous?.events ?? [], imported, start, end);
  const sameEvents = JSON.stringify(previous?.events) === JSON.stringify(events);
  const sameRange = previous?.sourceRange?.start === start && previous?.sourceRange?.end === end;
  const checkedAt = new Date().toISOString();
  if (sameEvents && sameRange) {
    await writeSyncStatus(checkedAt, previous.publishedAt, start, end, imported.length);
    console.log(`Schedule unchanged: ${imported.length} source rows (${start}–${end}).`);
    return;
  }

  const result = {
    planId: PLAN_ID,
    sourceUrl: SOURCE_URL,
    sourceRange: { start, end },
    publishedAt: checkedAt,
    events,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporary, OUTPUT);
  await writeSyncStatus(checkedAt, checkedAt, start, end, imported.length);
  console.log(`Published ${events.length} classes (${imported.length} from ${start}–${end}).`);
}

main().catch((error) => {
  console.error(`Schedule sync failed: ${error.message}`);
  process.exitCode = 1;
});
