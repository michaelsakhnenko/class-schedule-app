import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CalendarDots,
  CaretDown,
  CaretLeft,
  CaretRight,
  Clock,
  Info,
  MapPin,
  Moon,
  SidebarSimple,
  SlidersHorizontal,
  Sun,
  User,
  X,
} from "@phosphor-icons/react";
import { filterByLanguageGroup, formatLanguageGroup, getEventType, getEventTypeLabel, getLanguageGroups, getSchedule, isCancelled } from "./data/schedule.js";
import { assessSyncStatus, formatSyncTime, getLatestWorkflowRun, getSyncHeartbeat } from "./data/syncStatus.js";
import {
  addDays,
  classCountLabel,
  currentWarsawTime,
  formatDateRange,
  formatFullDate,
  formatMonth,
  formatShortDate,
  formatWeekday,
  isWeekend,
  minutes,
  monthDays,
  parseDay,
  startOfWeek,
  todayISO,
  toISO,
  weekDays,
} from "./lib/dates.js";

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_HEIGHT = 78;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
const MOBILE_WEEK_DAY_WIDTH = 136;
const MOBILE_WEEK_WIDTH = MOBILE_WEEK_DAY_WIDTH * 7;
const CALENDAR_START = "2026-10-01";
const CALENDAR_END = "2027-08-31";

function isCalendarDay(day) {
  return day >= CALENDAR_START && day <= CALENDAR_END;
}

function clampCalendarDay(day) {
  return day < CALENDAR_START ? CALENDAR_START : day > CALENDAR_END ? CALENDAR_END : day;
}

function isCalendarMonth(day) {
  return day.slice(0, 7) >= CALENDAR_START.slice(0, 7) && day.slice(0, 7) <= CALENDAR_END.slice(0, 7);
}

function shiftMonth(day, amount) {
  const date = parseDay(day);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toISO(date);
}

function shiftSelectedMonth(day, amount) {
  const date = parseDay(day);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return toISO(date);
}

function layoutEvents(events) {
  const sorted = [...events].sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(b.endTime) - minutes(a.endTime));
  const groups = [];
  let current = [];
  let currentEnd = -1;

  for (const event of sorted) {
    const start = minutes(event.startTime);
    if (current.length && start >= currentEnd) {
      groups.push(current);
      current = [];
      currentEnd = -1;
    }
    current.push(event);
    currentEnd = Math.max(currentEnd, minutes(event.endTime));
  }
  if (current.length) groups.push(current);

  return groups.flatMap((group) => {
    const columnEnds = [];
    const positions = group.map((event) => {
      const start = minutes(event.startTime);
      let column = columnEnds.findIndex((end) => end <= start);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = minutes(event.endTime);
      return { event, column };
    });
    return positions.map(({ event, column }) => ({ event, column, columns: columnEnds.length }));
  });
}

function MiniCalendar({ month, selectedDay, classDates, onSelect, onMonthChange }) {
  const days = monthDays(month);
  const monthNumber = parseDay(month).getUTCMonth();
  const today = todayISO();

  return (
    <section className="mini-calendar" aria-label="Mały kalendarz">
      <div className="mini-heading">
        <span>{formatMonth(month)}</span>
        <div className="mini-actions">
          <button className="icon-button small" type="button" aria-label="Poprzedni miesiąc" disabled={!isCalendarMonth(shiftMonth(month, -1))} onClick={() => onMonthChange(-1)}><CaretLeft size={16} /></button>
          <button className="icon-button small" type="button" aria-label="Następny miesiąc" disabled={!isCalendarMonth(shiftMonth(month, 1))} onClick={() => onMonthChange(1)}><CaretRight size={16} /></button>
        </div>
      </div>
      <div className="mini-weekdays" aria-hidden="true">{["P", "W", "Ś", "C", "P", "S", "N"].map((label, index) => <span key={index}>{label}</span>)}</div>
      <div className="mini-days">
        {days.map((day) => isCalendarDay(day) ? (
          <button
            className={`mini-day date-circle${day === selectedDay ? " is-selected" : ""}${day === today ? " is-today" : ""}${parseDay(day).getUTCMonth() !== monthNumber ? " is-outside" : ""}`}
            key={day}
            type="button"
            aria-label={formatFullDate(day)}
            aria-current={day === today ? "date" : undefined}
            aria-pressed={day === selectedDay}
            onClick={() => onSelect(day)}
          >
            <span>{parseDay(day).getUTCDate()}</span>
            {classDates.has(day) && <i className="mini-event-dot" aria-hidden="true" />}
          </button>
        ) : <span className="mini-day is-unavailable" key={day} aria-hidden="true" />)}
      </div>
    </section>
  );
}

function GroupFilter({ groups, value, onChange, id }) {
  if (!groups.length) return null;
  return (
    <label className="group-filter" htmlFor={id}>
      <span>Grupa angielskiego</span>
      <span className="group-filter-control">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Wszystkie grupy</option>
          {groups.map((group) => <option key={group} value={group}>{formatLanguageGroup(group)}</option>)}
        </select>
        <CaretDown size={16} aria-hidden="true" />
      </span>
    </label>
  );
}

function SyncStatusDetails({ heartbeat, latestRun, historyLoading, historyError, health }) {
  const label = {
    current: "Sprawdzono niedawno",
    delayed: "Sprawdzenie opóźnione",
    failed: "Ostatnia próba nieudana",
    running: "Sprawdzanie trwa",
    unknown: "Status niedostępny",
  }[health];

  return (
    <section className="sync-details" aria-label="Synchronizacja planu">
      <div className="sync-details-heading"><span>Synchronizacja</span><span className={`sync-state sync-state-${health}`}>{label}</span></div>
      <dl>
        <div><dt>Ostatnie udane sprawdzenie</dt><dd>{formatSyncTime(heartbeat?.checkedAt)}</dd></div>
        <div><dt>Ostatnia zmiana planu</dt><dd>{formatSyncTime(heartbeat?.changedAt)}</dd></div>
        {latestRun && latestRun.created_at > (heartbeat?.checkedAt ?? "") && <div><dt>Ostatnia próba</dt><dd>{formatSyncTime(latestRun.created_at)}</dd></div>}
      </dl>
      {health === "delayed" && <p>Nie było udanego sprawdzenia od ponad 95 minut.</p>}
      {health === "failed" && <p>Plan może być nieaktualny. Ostatnia próba synchronizacji zakończyła się błędem.</p>}
      {historyLoading && <p>Sprawdzanie ostatniej próby…</p>}
      {historyError && <p>Nie można sprawdzić ostatniej próby.</p>}
    </section>
  );
}

function MobileSettings({ groups, value, onGroupChange, theme, onThemeChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const chooseGroup = (group) => {
    onGroupChange(group);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="mobile-settings" ref={rootRef}>
      <button
        className="mobile-settings-trigger"
        ref={triggerRef}
        type="button"
        aria-label={groups.length > 0 && !value ? "Ustawienia kalendarza, wyświetlane są wszystkie grupy angielskiego" : "Ustawienia kalendarza"}
        aria-controls={open ? "mobile-settings-popover" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={20} weight="regular" aria-hidden="true" />
        {groups.length > 0 && !value && <span className="settings-group-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mobile-settings-popover" id="mobile-settings-popover">
          {groups.length > 0 && <GroupFilter groups={groups} value={value} onChange={chooseGroup} id="mobile-language-group" />}
          <div className="mobile-settings-theme">
            <span>Wygląd</span>
            <button
              className="mobile-theme-action"
              type="button"
              aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
              onClick={onThemeChange}
            >
              <span className="mobile-theme-icon-wrap" aria-hidden="true">
                <span className="theme-icon theme-icon-sun"><Sun size={20} weight="regular" /></span>
                <span className="theme-icon theme-icon-moon"><Moon size={20} weight="regular" /></span>
              </span>
              {theme === "dark" ? "Włącz jasny" : "Włącz ciemny"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncStatusButton({ syncDetails, onOpenStatus, popoverId }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="sync-status-control" ref={rootRef}>
      <button className="sync-trigger icon-button" ref={triggerRef} type="button" aria-label="Status synchronizacji planu" aria-expanded={open} aria-controls={open ? popoverId : undefined} onClick={() => { if (!open) onOpenStatus(); setOpen((current) => !current); }}>
        <Info size={20} weight="regular" aria-hidden="true" />
      </button>
      {open && <div className="sync-status-popover" id={popoverId}>{syncDetails}</div>}
    </div>
  );
}

function ViewSwitch({ view, onChange, className = "" }) {
  return (
    <div className={`view-switch ${className}`} role="group" aria-label="Widok kalendarza" data-view={view}>
      <span className="view-indicator" aria-hidden="true" />
      <button className={view === "day" ? "active" : ""} type="button" aria-pressed={view === "day"} aria-label={view === "day" ? "Dzień — wróć do dzisiaj" : undefined} onClick={() => onChange("day")}>Dzień</button>
      <button className={view === "week" ? "active" : ""} type="button" aria-pressed={view === "week"} onClick={() => onChange("week")}>Tydzień</button>
      <button className={view === "month" ? "active" : ""} type="button" aria-pressed={view === "month"} onClick={() => onChange("month")}>Miesiąc</button>
    </div>
  );
}

function Sidebar({ selectedDay, miniMonth, setMiniMonth, classDates, languageGroups, selectedGroup, onGroupChange, onSelectDay, collapsed }) {
  return (
    <aside id="schedule-sidebar" className="sidebar" aria-label="Panel boczny" aria-hidden={collapsed} inert={collapsed}>
      <div className="sidebar-main">
        <MiniCalendar
          month={miniMonth}
          selectedDay={selectedDay}
          classDates={classDates}
          onSelect={onSelectDay}
          onMonthChange={(amount) => setMiniMonth((value) => {
            const next = shiftMonth(value, amount);
            return isCalendarMonth(next) ? next : value;
          })}
        />
        {languageGroups.length > 0 && <div className="sidebar-group-filter"><GroupFilter groups={languageGroups} value={selectedGroup} onChange={onGroupChange} id="sidebar-language-group" /></div>}
      </div>
    </aside>
  );
}

function MonthPage({ selectedDay, events, isMobile, onSelectDay, onEventClick }) {
  const days = useMemo(() => monthDays(selectedDay), [selectedDay]);
  const currentMonth = selectedDay.slice(0, 7);
  const today = todayISO();
  const eventsByDay = useMemo(() => {
    const result = new Map(days.map((day) => [day, []]));
    events.forEach((event) => result.get(event.date)?.push(event));
    result.forEach((dayEvents) => dayEvents.sort((a, b) => minutes(a.startTime) - minutes(b.startTime)));
    return result;
  }, [days, events]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];

  return (
    <div className="month-surface">
      <div className="month-weekdays" aria-hidden="true">
        {["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"].map((label) => <span key={label}><span className="month-weekday-long">{label}</span><span className="month-weekday-short">{label.slice(0, 1)}</span></span>)}
      </div>
      <div className="month-scroll">
        <div className="month-cells" style={{ "--week-count": days.length / 7 }}>
          {days.map((day) => {
            if (!isCalendarDay(day)) return <div className="month-cell is-unavailable" key={day} aria-hidden="true" />;
            const dayEvents = eventsByDay.get(day) ?? [];
            const previewEvents = [...dayEvents].sort((a, b) => Number(isCancelled(a)) - Number(isCancelled(b)));
            return (
              <div className={`month-cell${day.slice(0, 7) !== currentMonth ? " is-outside" : ""}${isWeekend(day) ? " is-weekend" : ""}${isMobile && day === selectedDay ? " is-selected" : ""}`} key={day}>
                {isMobile
                  ? <button className={`month-date date-circle${day === today ? " is-today" : ""}${day === selectedDay ? " is-selected" : ""}`} type="button" aria-label={formatFullDate(day)} aria-current={day === today ? "date" : undefined} aria-pressed={day === selectedDay} onClick={() => onSelectDay(day)}>{parseDay(day).getUTCDate()}</button>
                  : <time className={`month-date is-static${day === today ? " is-today" : ""}`} dateTime={day} aria-current={day === today ? "date" : undefined}>{parseDay(day).getUTCDate()}</time>}
                <div className="month-event-list">
                  {previewEvents.slice(0, 3).map((event) => <button className={`month-event type-${getEventType(event)}${isCancelled(event) ? " is-cancelled" : ""}`} type="button" key={event.id} aria-label={`${event.title}, ${isCancelled(event) ? "Odwołane, " : ""}${getEventTypeLabel(event)}, ${event.startTime}`} onClick={() => onEventClick(event)}><span className="month-event-time">{event.startTime}</span><span className="month-event-label"><strong>{event.title}</strong>{isCancelled(event) && <small>Odwołane</small>}</span></button>)}
                  {dayEvents.length > 3 && <span className="month-more">+{dayEvents.length - 3} więcej</span>}
                </div>
                <div className="month-dots" aria-hidden="true">{previewEvents.slice(0, 4).map((event) => <i className={`month-dot type-${getEventType(event)}${isCancelled(event) ? " is-cancelled" : ""}`} key={event.id} />)}</div>
              </div>
            );
          })}
        </div>
        <section className="month-agenda" aria-label={`Zajęcia: ${formatFullDate(selectedDay)}`}>
          <h2>{formatFullDate(selectedDay)}</h2>
          {selectedEvents.length ? selectedEvents.map((event) => <button className={`month-agenda-event type-${getEventType(event)}${isCancelled(event) ? " is-cancelled" : ""}`} type="button" key={event.id} aria-label={`${event.title}, ${isCancelled(event) ? "Odwołane, " : ""}${event.startTime}–${event.endTime}`} onClick={() => onEventClick(event)}><strong>{event.title}</strong>{isCancelled(event) && <span className="event-status">Odwołane</span>}<span className="month-agenda-time"><Clock size={14} aria-hidden="true" />{event.startTime}–{event.endTime}</span><small className="month-agenda-room"><MapPin size={14} aria-hidden="true" />{event.room}</small></button>) : <p>Brak zajęć w tym dniu</p>}
        </section>
      </div>
    </div>
  );
}

function MonthGrid({ selectedDay, events, isMobile, onSelectDay, onEventClick, onSwipeMonth }) {
  const swipeStartRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const settleTimerRef = useRef(null);
  const settlingRef = useRef(false);
  const pageDays = useMemo(() => [shiftSelectedMonth(selectedDay, -1), selectedDay, shiftSelectedMonth(selectedDay, 1)], [selectedDay]);
  const canSwipePrevious = isCalendarMonth(pageDays[0]);
  const canSwipeNext = isCalendarMonth(pageDays[2]);

  useLayoutEffect(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    settlingRef.current = false;
    const track = trackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = "translate3d(-33.333333%, 0, 0)";
    }
  }, [selectedDay, isMobile]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  function settle(direction) {
    if ((direction < 0 && !canSwipePrevious) || (direction > 0 && !canSwipeNext)) direction = 0;
    const track = trackRef.current;
    const width = viewportRef.current?.clientWidth;
    if (!track || !width) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    settlingRef.current = true;
    track.style.transition = duration ? `transform ${duration}ms var(--ease-out)` : "none";
    track.style.transform = `translate3d(calc(-33.333333% + ${-direction * width}px), 0, 0)`;
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      if (direction) flushSync(() => onSwipeMonth(direction));
      else {
        track.style.transition = "none";
        track.style.transform = "translate3d(-33.333333%, 0, 0)";
        settlingRef.current = false;
      }
    }, duration + 16);
  }

  function handleTouchStart(event) {
    if (event.touches.length !== 1 || settlingRef.current) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: performance.now(), axis: null };
  }

  function moveSwipe(x, y) {
    const start = swipeStartRef.current;
    if (!start) return;
    const distanceX = x - start.x;
    const distanceY = y - start.y;
    if (!start.axis && Math.max(Math.abs(distanceX), Math.abs(distanceY)) >= 8) {
      start.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.2 ? "x" : "y";
    }
    if (start.axis !== "x") return;
    const width = viewportRef.current?.clientWidth ?? 0;
    const offset = Math.max(canSwipeNext ? -width : 0, Math.min(canSwipePrevious ? width : 0, distanceX));
    const track = trackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(-33.333333% + ${offset}px), 0, 0)`;
    }
  }

  function endSwipe(x, y) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.axis === "y") return;
    const distanceX = x - start.x;
    const distanceY = y - start.y;
    if (Math.abs(distanceX) < 12 || Math.abs(distanceX) < Math.abs(distanceY) * 1.2) {
      if (start.axis === "x") settle(0);
      return;
    }
    suppressClickUntilRef.current = performance.now() + 350;
    const width = viewportRef.current?.clientWidth ?? 0;
    const elapsed = Math.max(1, performance.now() - start.at);
    const shouldChange = Math.abs(distanceX) >= Math.min(96, width * 0.25) || (Math.abs(distanceX) >= 32 && Math.abs(distanceX) / elapsed > 0.45);
    settle(shouldChange ? (distanceX < 0 ? 1 : -1) : 0);
  }

  function handleTouchMove(event) {
    if (event.touches.length === 1) moveSwipe(event.touches[0].clientX, event.touches[0].clientY);
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches[0];
    if (touch) endSwipe(touch.clientX, touch.clientY);
  }

  function handlePointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0 || settlingRef.current) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY, at: performance.now(), axis: null };
  }

  function handlePointerMove(event) {
    if (event.pointerType === "mouse" && event.buttons === 1) moveSwipe(event.clientX, event.clientY);
  }

  function handlePointerUp(event) {
    if (event.pointerType === "mouse") endSwipe(event.clientX, event.clientY);
  }

  if (!isMobile) return <MonthPage selectedDay={selectedDay} events={events} isMobile={false} onSelectDay={onSelectDay} onEventClick={onEventClick} />;

  return (
    <div className="month-carousel-viewport" ref={viewportRef} role="region" aria-label="Kalendarz miesięczny" tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        if (direction > 0 ? canSwipeNext : canSwipePrevious) onSwipeMonth(direction);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { if (swipeStartRef.current?.axis === "x") settle(0); swipeStartRef.current = null; }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { if (swipeStartRef.current?.axis === "x") settle(0); swipeStartRef.current = null; }}
      onClickCapture={(event) => { if (performance.now() < suppressClickUntilRef.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <div className="month-carousel-track" ref={trackRef}>
        {pageDays.map((day) => <div className="month-carousel-pane" key={day} inert={day !== selectedDay} aria-hidden={day !== selectedDay}>
          <MonthPage selectedDay={day} events={events} isMobile onSelectDay={onSelectDay} onEventClick={onEventClick} />
        </div>)}
      </div>
    </div>
  );
}

function EventCard({ event, column, columns, onClick }) {
  const start = minutes(event.startTime);
  const end = minutes(event.endTime);
  const top = ((start - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = ((end - start) / 60) * HOUR_HEIGHT;
  const width = 100 / columns;

  return (
    <button
      className={`event-card type-${getEventType(event)}${isCancelled(event) ? " is-cancelled" : ""}`}
      type="button"
      style={{ top: `${top + 4}px`, height: `${Math.max(height - 8, 48)}px`, left: `calc(${column * width}% + 4px)`, width: `calc(${width}% - 8px)` }}
      aria-label={`${event.title}, ${isCancelled(event) ? "Odwołane, " : ""}${event.startTime}–${event.endTime}, ${event.room}, ${getEventTypeLabel(event)}`}
      onClick={() => onClick(event)}
    >
      <strong className="event-title">{event.title}</strong>
      {isCancelled(event) && <span className="event-status">Odwołane</span>}
      <span className="event-time"><Clock size={12} aria-hidden="true" /><span>{event.startTime}–{event.endTime}</span></span>
      <span className="event-room"><MapPin size={12} aria-hidden="true" /><span>{event.room}</span></span>
    </button>
  );
}

function MobileWeekTimeline({ selectedDay, events, now, onEventClick, onWeekChange, scrollTopRef }) {
  const weekStart = startOfWeek(selectedDay);
  const weeks = useMemo(() => [-1, 0, 1].map((offset) => addDays(weekStart, offset * 7)), [weekStart]);
  const eventsByDay = useMemo(() => {
    const result = new Map();
    events.forEach((event) => {
      if (!result.has(event.date)) result.set(event.date, []);
      result.get(event.date).push(event);
    });
    return result;
  }, [events]);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const axisCoverRef = useRef(null);
  const axisContentRef = useRef(null);
  const scrollerRefs = useRef([]);
  const headerRefs = useRef([]);
  const timelineRefs = useRef([]);
  const edgeGestureRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const axisHideTimerRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const entryDirectionRef = useRef(0);
  const transitioningRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const today = todayISO();
  const currentTimePosition = ((now.hour * 60 + now.minute) / 60) * HOUR_HEIGHT;
  const showCurrentTime = currentTimePosition >= 0 && currentTimePosition <= END_HOUR * HOUR_HEIGHT;
  const canPreviousWeek = weekStart > startOfWeek(CALENDAR_START);
  const canNextWeek = weekStart < startOfWeek(CALENDAR_END);

  useLayoutEffect(() => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    if (axisHideTimerRef.current) window.clearTimeout(axisHideTimerRef.current);
    transitionTimerRef.current = null;
    axisHideTimerRef.current = null;
    transitioningRef.current = false;
    axisCoverRef.current?.classList.remove("is-active");
    const track = trackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = "translate3d(-33.333333%, 0, 0)";
    }
    scrollerRefs.current.forEach((scroller, index) => {
      if (!scroller) return;
      const maximum = scroller.scrollWidth - scroller.clientWidth;
      if (index === 0) scroller.scrollLeft = maximum;
      else if (index === 2) scroller.scrollLeft = 0;
      else if (entryDirectionRef.current) scroller.scrollLeft = entryDirectionRef.current > 0 ? 0 : maximum;
      else {
        const weekday = Math.round((parseDay(selectedDay) - parseDay(weekStart)) / 86400000);
        scroller.scrollLeft = Math.max(0, Math.min(maximum, weekday * MOBILE_WEEK_DAY_WIDTH + MOBILE_WEEK_DAY_WIDTH / 2 - scroller.clientWidth / 2));
      }
      if (headerRefs.current[index]) headerRefs.current[index].scrollLeft = scroller.scrollLeft;
    });
    entryDirectionRef.current = 0;
    const currentTimeline = timelineRefs.current[1];
    if (scrollTopRef.current === null && currentTimeline) scrollTopRef.current = Math.max(0, currentTimePosition - currentTimeline.clientHeight * 0.3);
    timelineRefs.current.forEach((timeline) => { if (timeline) timeline.scrollTop = scrollTopRef.current ?? 0; });
  }, [weekStart]);

  useEffect(() => () => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    if (axisHideTimerRef.current) window.clearTimeout(axisHideTimerRef.current);
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
  }, []);

  function showFixedAxis() {
    if (axisHideTimerRef.current) window.clearTimeout(axisHideTimerRef.current);
    axisHideTimerRef.current = null;
    const currentTop = timelineRefs.current[1]?.scrollTop ?? 0;
    if (axisContentRef.current) axisContentRef.current.style.transform = `translate3d(0, ${-currentTop}px, 0)`;
    axisCoverRef.current?.classList.add("is-active");
  }

  function selectVisibleDay() {
    const scroller = scrollerRefs.current[1];
    if (!scroller || transitioningRef.current) return;
    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    const index = Math.max(0, Math.min(6, Math.floor(center / MOBILE_WEEK_DAY_WIDTH)));
    const day = clampCalendarDay(addDays(weekStart, index));
    if (day !== selectedDay) onWeekChange(day);
  }

  function handleNativeScroll(event) {
    if (headerRefs.current[1]) headerRefs.current[1].scrollLeft = event.currentTarget.scrollLeft;
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(selectVisibleDay, 140);
  }

  function slideToWeek(direction) {
    if (transitioningRef.current) return;
    const track = trackRef.current;
    const width = viewportRef.current?.clientWidth ?? 0;
    if (!track || !width) return;
    showFixedAxis();
    transitioningRef.current = true;
    suppressClickUntilRef.current = performance.now() + 350;
    const currentTop = timelineRefs.current[1]?.scrollTop ?? 0;
    scrollTopRef.current = currentTop;
    timelineRefs.current.forEach((timeline) => { if (timeline) timeline.scrollTop = currentTop; });
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    track.style.transition = duration ? `transform ${duration}ms var(--ease-out)` : "none";
    track.style.transform = `translate3d(calc(-33.333333% + ${-direction * width}px), 0, 0)`;
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      entryDirectionRef.current = direction;
      flushSync(() => onWeekChange(clampCalendarDay(addDays(weekStart, direction > 0 ? 7 : -1))));
    }, duration + 16);
  }

  function resetEdgeDrag() {
    const track = trackRef.current;
    if (!track) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    track.style.transition = duration ? `transform ${duration}ms var(--ease-out)` : "none";
    track.style.transform = "translate3d(-33.333333%, 0, 0)";
    axisHideTimerRef.current = window.setTimeout(() => {
      axisHideTimerRef.current = null;
      axisCoverRef.current?.classList.remove("is-active");
    }, duration);
  }

  function startEdgeTouch(event) {
    if (event.touches.length !== 1 || transitioningRef.current) return;
    const scroller = event.currentTarget;
    const maximum = scroller.scrollWidth - scroller.clientWidth;
    edgeGestureRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      previous: canPreviousWeek && scroller.scrollLeft <= 2,
      next: canNextWeek && scroller.scrollLeft >= maximum - 2,
      direction: 0,
    };
  }

  function moveEdgeTouch(event) {
    const gesture = edgeGestureRef.current;
    if (!gesture || event.touches.length !== 1) return;
    const distanceX = event.touches[0].clientX - gesture.x;
    const distanceY = event.touches[0].clientY - gesture.y;
    if (Math.abs(distanceX) < 8 || Math.abs(distanceX) < Math.abs(distanceY) * 1.2) return;
    const direction = distanceX < 0 && gesture.next ? 1 : distanceX > 0 && gesture.previous ? -1 : 0;
    if (!direction) return;
    if (!gesture.direction) showFixedAxis();
    gesture.direction = direction;
    const width = viewportRef.current?.clientWidth ?? 0;
    const offset = Math.max(-width, Math.min(width, distanceX));
    const track = trackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(-33.333333% + ${offset}px), 0, 0)`;
    }
  }

  function finishEdgeTouch(event, cancelled = false) {
    const gesture = edgeGestureRef.current;
    edgeGestureRef.current = null;
    if (!gesture?.direction) return;
    suppressClickUntilRef.current = performance.now() + 350;
    const distanceX = (event.changedTouches[0]?.clientX ?? gesture.x) - gesture.x;
    const threshold = Math.min(96, (viewportRef.current?.clientWidth ?? 0) * 0.25);
    if (!cancelled && Math.abs(distanceX) >= threshold) slideToWeek(gesture.direction);
    else resetEdgeDrag();
  }

  return (
    <div className="calendar-surface week-surface mobile-week-surface" ref={viewportRef}>
      <div className="mobile-week-track" ref={trackRef} onClickCapture={(event) => {
        if (performance.now() < suppressClickUntilRef.current) { event.preventDefault(); event.stopPropagation(); }
      }}>
        {weeks.map((paneWeek, paneIndex) => {
          const paneDays = weekDays(paneWeek);
          const showNow = showCurrentTime && paneDays.includes(today);
          return <div className="mobile-week-pane" key={paneWeek} inert={paneIndex !== 1} aria-hidden={paneIndex !== 1}>
            <div className="calendar-inner" style={{ "--day-count": 7 }}>
              <div className="date-header"><div className="mobile-week-date-scroll" ref={(node) => { headerRefs.current[paneIndex] = node; }}><div className="date-header-days" style={{ width: `${MOBILE_WEEK_WIDTH}px` }}>
                {paneDays.map((day) => <div className={`date-header-day is-static${day === today ? " is-today" : ""}`} key={day} aria-current={day === today ? "date" : undefined} aria-hidden={!isCalendarDay(day) ? true : undefined}>
                  {isCalendarDay(day) && <><span>{formatWeekday(day)}</span><strong>{parseDay(day).getUTCDate()}</strong></>}
                </div>)}
              </div></div></div>
              <div className="timeline-scroll" ref={(node) => { timelineRefs.current[paneIndex] = node; }} onScroll={paneIndex === 1 ? (event) => { scrollTopRef.current = event.currentTarget.scrollTop; } : undefined}>
                <div className="timeline-body" style={{ height: `${END_HOUR * HOUR_HEIGHT}px` }}>
                  <div className="time-axis">
                    {HOURS.map((hour) => <div className="hour-label" key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }}>{`${String(hour % 24).padStart(2, "0")}:00`}</div>)}
                    {showNow && <span className="now-label" style={{ top: `${currentTimePosition}px` }}>{`${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`}</span>}
                  </div>
                  <div
                    className="mobile-week-native-scroll"
                    ref={(node) => { scrollerRefs.current[paneIndex] = node; }}
                    role={paneIndex === 1 ? "region" : undefined}
                    aria-label={paneIndex === 1 ? "Kalendarz tygodniowy" : undefined}
                    tabIndex={paneIndex === 1 ? 0 : -1}
                    onScroll={paneIndex === 1 ? handleNativeScroll : undefined}
                    onTouchStart={paneIndex === 1 ? startEdgeTouch : undefined}
                    onTouchMove={paneIndex === 1 ? moveEdgeTouch : undefined}
                    onTouchEnd={paneIndex === 1 ? finishEdgeTouch : undefined}
                    onTouchCancel={paneIndex === 1 ? (event) => finishEdgeTouch(event, true) : undefined}
                    onKeyDown={paneIndex === 1 ? (event) => {
                      if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                      const scroller = event.currentTarget;
                      const maximum = scroller.scrollWidth - scroller.clientWidth;
                      if (event.key === "ArrowLeft" && scroller.scrollLeft <= 1 && canPreviousWeek) { event.preventDefault(); slideToWeek(-1); }
                      if (event.key === "ArrowRight" && scroller.scrollLeft >= maximum - 1 && canNextWeek) { event.preventDefault(); slideToWeek(1); }
                    } : undefined}
                  >
                    <div className="day-tracks" style={{ width: `${MOBILE_WEEK_WIDTH}px`, height: "100%" }}>
                      {HOURS.map((hour) => <div className="hour-rule" key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }} />)}
                      {paneDays.map((day) => <div className={`day-track${day === today ? " is-today" : ""}${isWeekend(day) && isCalendarDay(day) ? " is-weekend" : ""}`} key={day} inert={!isCalendarDay(day)} aria-hidden={!isCalendarDay(day) ? true : undefined}>
                        {isCalendarDay(day) && layoutEvents(eventsByDay.get(day) ?? []).map(({ event, column, columns }) => <EventCard event={event} column={column} columns={columns} onClick={onEventClick} key={event.id} />)}
                        {day === today && showNow && <div className="now-line" style={{ top: `${currentTimePosition}px` }}><i /></div>}
                      </div>)}
                      {showNow && <div className="now-line-global" style={{ top: `${currentTimePosition}px` }} />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>;
        })}
      </div>
      <div className="mobile-week-axis-cover" ref={axisCoverRef} aria-hidden="true">
        <div className="mobile-week-axis-content time-axis" ref={axisContentRef} style={{ height: `${END_HOUR * HOUR_HEIGHT}px` }}>
          {HOURS.map((hour) => <div className="hour-label" key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }}>{`${String(hour % 24).padStart(2, "0")}:00`}</div>)}
          {showCurrentTime && weeks[1] === startOfWeek(today) && <span className="now-label" style={{ top: `${currentTimePosition}px` }}>{`${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`}</span>}
        </div>
      </div>
    </div>
  );
}

function CalendarTimeline({ days, selectedDay, events, view, isMobileDay, now, onEventClick, onSwipeDay, scrollTopRef }) {
  const scrollRef = useRef(null);
  const swipeStartRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const carouselViewportRef = useRef(null);
  const carouselTrackRef = useRef(null);
  const settleTimerRef = useRef(null);
  const settlingRef = useRef(false);
  const today = todayISO();
  const currentTimePosition = ((now.hour * 60 + now.minute - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const showCurrentTime = currentTimePosition >= 0 && currentTimePosition <= (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const carouselDays = useMemo(() => [addDays(selectedDay, -1), selectedDay, addDays(selectedDay, 1)], [selectedDay]);
  const renderedDays = isMobileDay ? carouselDays : days;
  const showNowInColumns = showCurrentTime && days.includes(today);
  const eventsByDay = useMemo(() => {
    const result = new Map(renderedDays.map((day) => [day, []]));
    events.forEach((event) => result.get(event.date)?.push(event));
    return result;
  }, [renderedDays, events]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTop = scrollTopRef.current ?? Math.max(0, currentTimePosition - scroll.clientHeight * 0.3);
    scrollTopRef.current = scroll.scrollTop;
  }, []);

  useLayoutEffect(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    settlingRef.current = false;
    const track = carouselTrackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = "translate3d(-33.333333%, 0, 0)";
    }
  }, [selectedDay, isMobileDay]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  function settleCarousel(direction) {
    if (direction && !isCalendarDay(addDays(selectedDay, direction))) direction = 0;
    const track = carouselTrackRef.current;
    const width = carouselViewportRef.current?.clientWidth;
    if (!track || !width) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 220;
    settlingRef.current = true;
    track.style.transition = `transform ${duration}ms var(--ease-out)`;
    track.style.transform = `translate3d(calc(-33.333333% + ${-direction * width}px), 0, 0)`;
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      if (direction) {
        flushSync(() => onSwipeDay(direction));
      } else {
        track.style.transition = "none";
        track.style.transform = "translate3d(-33.333333%, 0, 0)";
        settlingRef.current = false;
      }
    }, duration + 16);
  }

  function handleTouchStart(event) {
    if (!isMobileDay || event.touches.length !== 1 || settlingRef.current) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: performance.now(), axis: null };
  }

  function handleTouchMove(event) {
    const start = swipeStartRef.current;
    if (!start || event.touches.length !== 1) return;
    const distanceX = event.touches[0].clientX - start.x;
    const distanceY = event.touches[0].clientY - start.y;
    if (!start.axis && Math.max(Math.abs(distanceX), Math.abs(distanceY)) >= 8) {
      start.axis = Math.abs(distanceX) > Math.abs(distanceY) * 1.2 ? "x" : "y";
    }
    if (start.axis !== "x") return;
    const width = carouselViewportRef.current?.clientWidth ?? 0;
    const offset = Math.max(isCalendarDay(addDays(selectedDay, 1)) ? -width : 0, Math.min(isCalendarDay(addDays(selectedDay, -1)) ? width : 0, distanceX));
    const track = carouselTrackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = `translate3d(calc(-33.333333% + ${offset}px), 0, 0)`;
    }
  }

  function handleTouchEnd(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || !isMobileDay || start.axis === "y") return;
    const distanceX = touch.clientX - start.x;
    const distanceY = touch.clientY - start.y;
    if (Math.abs(distanceX) < 12 || Math.abs(distanceX) < Math.abs(distanceY) * 1.2) {
      if (start.axis === "x") settleCarousel(0);
      return;
    }
    suppressClickUntilRef.current = performance.now() + 350;
    const width = carouselViewportRef.current?.clientWidth ?? 0;
    const elapsed = Math.max(1, performance.now() - start.at);
    const shouldChangeDay = Math.abs(distanceX) >= Math.min(96, width * 0.25) || (Math.abs(distanceX) >= 32 && Math.abs(distanceX) / elapsed > 0.45);
    settleCarousel(shouldChangeDay ? (distanceX < 0 ? 1 : -1) : 0);
  }

  return (
    <div
      className={`calendar-surface ${view === "week" ? "week-surface" : "day-surface"}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        if (swipeStartRef.current?.axis === "x") settleCarousel(0);
        swipeStartRef.current = null;
      }}
      onClickCapture={(event) => {
        if (performance.now() < suppressClickUntilRef.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="calendar-inner" style={{ "--day-count": days.length }}>
        <div className="date-header">
          <div aria-hidden="true" />
          <div className="date-header-days">
            {days.map((day) => <div className={`date-header-day is-static${day === today ? " is-today" : ""}`} key={day} aria-current={day === today ? "date" : undefined} aria-hidden={!isCalendarDay(day) ? true : undefined}>
              {isCalendarDay(day) && <><span>{formatWeekday(day)}</span><strong>{parseDay(day).getUTCDate()}</strong></>}
            </div>)}
          </div>
        </div>
        <div className="timeline-scroll" ref={scrollRef} onScroll={(event) => { scrollTopRef.current = event.currentTarget.scrollTop; }}>
          <div className="timeline-body" style={{ height: `${(END_HOUR - START_HOUR) * HOUR_HEIGHT}px` }}>
            <div className="time-axis">
              {HOURS.map((hour) => <div className="hour-label" key={hour} style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}>{`${String(hour % 24).padStart(2, "0")}:00`}</div>)}
              {showNowInColumns && <span className="now-label" style={{ top: `${currentTimePosition}px` }}>{`${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`}</span>}
            </div>
            {isMobileDay ? (
              <div className="mobile-carousel-viewport" ref={carouselViewportRef}>
                <div className="mobile-carousel-track" ref={carouselTrackRef}>
                  {renderedDays.map((day) => (
                    <div className="mobile-carousel-pane" key={day} inert={day !== selectedDay} aria-hidden={day !== selectedDay}>
                      {HOURS.map((hour) => <div className="hour-rule" key={hour} style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }} />)}
                      <div className={`day-track${day === today ? " is-today" : ""}${day === selectedDay ? " is-selected" : ""}${isWeekend(day) ? " is-weekend" : ""}`}>
                        {isCalendarDay(day) && layoutEvents(eventsByDay.get(day) ?? []).map(({ event, column, columns }) => <EventCard event={event} column={column} columns={columns} onClick={onEventClick} key={event.id} />)}
                        {day === today && showCurrentTime && <div className="now-line" style={{ top: `${currentTimePosition}px` }}><i /></div>}
                      </div>
                      {day === today && showCurrentTime && <div className="now-line-global" style={{ top: `${currentTimePosition}px` }} />}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="day-tracks">
                {HOURS.map((hour) => <div className="hour-rule" key={hour} style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }} />)}
                {days.map((day) => (
                  <div className={`day-track${day === today ? " is-today" : ""}${day === selectedDay ? " is-selected" : ""}${isWeekend(day) && isCalendarDay(day) ? " is-weekend" : ""}`} key={day} inert={!isCalendarDay(day)} aria-hidden={!isCalendarDay(day) ? true : undefined}>
                    {isCalendarDay(day) && layoutEvents(eventsByDay.get(day) ?? []).map(({ event, column, columns }) => <EventCard event={event} column={column} columns={columns} onClick={onEventClick} key={event.id} />)}
                    {day === today && showCurrentTime && <div className="now-line" style={{ top: `${currentTimePosition}px` }}><i /></div>}
                  </div>
                ))}
                {showNowInColumns && <div className="now-line-global" style={{ top: `${currentTimePosition}px` }} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDialog({ event, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [event, onClose]);

  if (!event) return null;

  return (
    <dialog className={`event-dialog${isCancelled(event) ? " is-cancelled" : ""}`} ref={dialogRef} aria-labelledby="event-dialog-title" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div className="dialog-content">
        <button className="dialog-close icon-button" type="button" aria-label="Zamknij szczegóły" onClick={() => dialogRef.current?.close()}><X size={16} /></button>
        <h2 id="event-dialog-title">{event.title}</h2>
        <div className="dialog-detail"><CalendarDots size={16} /><span>{formatFullDate(event.date)}</span></div>
        <div className="dialog-detail"><Clock size={16} /><span>{event.startTime}–{event.endTime}</span></div>
        <div className="dialog-detail"><MapPin size={16} /><span>{event.room}</span></div>
        <div className="dialog-detail"><User size={16} /><span>{event.instructor}</span></div>
        <div className="dialog-badges">
          {isCancelled(event) && <span className="dialog-cancelled">Odwołane</span>}
          <span className={`dialog-category type-${getEventType(event)}`}>{getEventTypeLabel(event)}</span>
          <span className="dialog-group">{event.group}</span>
        </div>
        {isCancelled(event) && <p className="dialog-cancelled-note">Tych zajęć nie ma w aktualnym planie uczelni.</p>}
      </div>
    </dialog>
  );
}

export function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem("class-schedule-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [selectedDay, setSelectedDay] = useState(() => clampCalendarDay(todayISO()));
  const [view, setView] = useState(() => window.matchMedia("(max-width: 760px)").matches ? "day" : "week");
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [miniMonth, setMiniMonth] = useState(() => clampCalendarDay(todayISO()));
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    try { return window.localStorage.getItem("class-schedule-language-group") ?? ""; } catch { return ""; }
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [now, setNow] = useState(currentWarsawTime);
  const [syncHeartbeat, setSyncHeartbeat] = useState(null);
  const [latestSyncRun, setLatestSyncRun] = useState(null);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncHistoryError, setSyncHistoryError] = useState(false);
  const lastHistoryFetch = useRef(0);
  const timelineScrollTopRef = useRef(null);
  const closeEvent = useCallback(() => setSelectedEvent(null), []);

  useEffect(() => {
    try { window.localStorage.setItem("class-schedule-theme", theme); } catch { /* Storage can be unavailable. */ }
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151515" : "#faf9f7");
  }, [theme]);

  useEffect(() => {
    const setPointerModality = () => { document.documentElement.dataset.inputModality = "pointer"; };
    const setKeyboardModality = () => { document.documentElement.dataset.inputModality = "keyboard"; };
    document.addEventListener("pointerdown", setPointerModality, true);
    document.addEventListener("keydown", setKeyboardModality, true);
    return () => {
      document.removeEventListener("pointerdown", setPointerModality, true);
      document.removeEventListener("keydown", setKeyboardModality, true);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const handleChange = () => setIsMobile(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const schedule = await getSchedule();
        if (active) { setAllEvents(schedule.events); setLoadError(false); setLoading(false); }
      } catch {
        if (active) { setLoadError(true); setLoading(false); }
      }
    }
    async function loadHeartbeat() {
      try {
        const status = await getSyncHeartbeat();
        if (active) setSyncHeartbeat(status);
      } catch {
        if (active) setSyncHeartbeat(null);
      }
    }
    load();
    loadHeartbeat();
    const clockTimer = window.setInterval(() => setNow(currentWarsawTime()), 60000);
    const refreshTimer = window.setInterval(() => { load(); loadHeartbeat(); }, 10 * 60 * 1000);
    const refreshOnFocus = () => { if (document.visibilityState === "visible") { load(); loadHeartbeat(); } };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => { active = false; window.clearInterval(clockTimer); window.clearInterval(refreshTimer); document.removeEventListener("visibilitychange", refreshOnFocus); };
  }, [retryKey]);

  const loadSyncHistory = useCallback(async () => {
    if (Date.now() - lastHistoryFetch.current < 60_000) return;
    lastHistoryFetch.current = Date.now();
    setSyncHistoryLoading(true);
    setSyncHistoryError(false);
    try { setLatestSyncRun(await getLatestWorkflowRun()); }
    catch { setSyncHistoryError(true); }
    finally { setSyncHistoryLoading(false); }
  }, []);

  const syncHealth = assessSyncStatus(syncHeartbeat, latestSyncRun, Date.now());
  const syncDetails = <SyncStatusDetails heartbeat={syncHeartbeat} latestRun={latestSyncRun} historyLoading={syncHistoryLoading} historyError={syncHistoryError} health={syncHealth} />;

  const today = todayISO();
  const languageGroups = useMemo(() => getLanguageGroups(allEvents), [allEvents]);
  const activeGroup = languageGroups.includes(selectedGroup) ? selectedGroup : "";
  const events = useMemo(() => filterByLanguageGroup(allEvents, activeGroup), [allEvents, activeGroup]);

  const days = useMemo(() => view === "week" ? weekDays(selectedDay) : view === "month" ? monthDays(selectedDay) : [selectedDay], [selectedDay, view]);
  const currentWeek = useMemo(() => weekDays(selectedDay), [selectedDay]);
  const monthlyClasses = useMemo(() => events.filter((event) => event.date.slice(0, 7) === selectedDay.slice(0, 7)), [events, selectedDay]);
  const classDates = useMemo(() => new Set(events.filter((event) => !isCancelled(event)).map((event) => event.date)), [events]);
  const visibleClasses = useMemo(() => events.filter((event) => isCalendarDay(event.date) && days.includes(event.date)), [events, days]);
  const displayedCount = (view === "month" ? monthlyClasses : visibleClasses).filter((event) => !isCancelled(event)).length;
  const showToolbarDate = view === "week" || (view === "day" && !isMobile);
  const titleDay = view === "week" ? clampCalendarDay(startOfWeek(selectedDay)) : selectedDay;
  const [titleMonth, titleYear] = formatMonth(titleDay).split(" ");
  const canNavigate = (amount) => {
    if (view === "month") return isCalendarMonth(shiftSelectedMonth(selectedDay, amount));
    if (view === "week") {
      const targetWeek = addDays(startOfWeek(selectedDay), amount * 7);
      return targetWeek >= startOfWeek(CALENDAR_START) && targetWeek <= startOfWeek(CALENDAR_END);
    }
    return isCalendarDay(addDays(selectedDay, amount));
  };

  function selectDay(day) {
    const next = clampCalendarDay(day);
    setSelectedDay(next);
    setMiniMonth(next);
  }

  function selectView(nextView) {
    if (nextView === "day" && view === "day") selectDay(todayISO());
    else setView(nextView);
  }

  function navigate(amount) {
    if (!canNavigate(amount)) return;
    selectDay(view === "month" ? shiftSelectedMonth(selectedDay, amount) : addDays(selectedDay, amount * (view === "week" ? 7 : 1)));
  }

  function toggleSidebar() {
    const nextCollapsed = !sidebarCollapsed;
    try { window.localStorage.setItem("class-schedule-sidebar-collapsed", String(nextCollapsed)); } catch { /* Storage can be unavailable. */ }
    setSidebarCollapsed(nextCollapsed);
  }

  function chooseGroup(group) {
    setSelectedGroup(group);
    try {
      if (group) window.localStorage.setItem("class-schedule-language-group", group);
      else window.localStorage.removeItem("class-schedule-language-group");
    } catch { /* Storage can be unavailable. */ }
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <Sidebar selectedDay={selectedDay} miniMonth={miniMonth} setMiniMonth={setMiniMonth} classDates={classDates} languageGroups={languageGroups} selectedGroup={activeGroup} onGroupChange={chooseGroup} onSelectDay={selectDay} collapsed={sidebarCollapsed} />
      <main className="main-area">
        <header className="topbar">
          <button
            className="sidebar-toggle icon-button"
            type="button"
            aria-label={sidebarCollapsed ? "Pokaż panel boczny" : "Ukryj panel boczny"}
            title={sidebarCollapsed ? "Pokaż panel boczny" : "Ukryj panel boczny"}
            aria-controls="schedule-sidebar"
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <SidebarSimple size={16} />
          </button>
          {languageGroups.length > 0 && <div className="collapsed-group-filter"><GroupFilter groups={languageGroups} value={activeGroup} onChange={chooseGroup} id="collapsed-language-group" /></div>}
          <ViewSwitch view={view} onChange={selectView} className="desktop-view-switch" />
          <div className="topbar-right">
            <SyncStatusButton syncDetails={syncDetails} onOpenStatus={loadSyncHistory} popoverId="desktop-sync-popover" />
            <button
              className="theme-toggle icon-button"
              type="button"
              aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
              title={theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}
              aria-pressed={theme === "light"}
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            >
              <span className="theme-icon theme-icon-sun" aria-hidden="true"><Sun size={20} weight="regular" /></span>
              <span className="theme-icon theme-icon-moon" aria-hidden="true"><Moon size={20} weight="regular" /></span>
            </button>
          </div>
        </header>
        <div className="calendar-toolbar">
          <div className="calendar-heading">
            <h1><strong>{titleMonth}</strong> <span>{titleYear}</span></h1>
            <div className="range-label">{showToolbarDate && <><span className="range-long">{view === "week" ? formatDateRange(days.filter(isCalendarDay)) : formatFullDate(selectedDay)}</span><span className="range-short">{view === "week" ? formatDateRange(days.filter(isCalendarDay)) : formatShortDate(selectedDay)}</span> <i>·</i> </>}{displayedCount} {classCountLabel(displayedCount)}</div>
          </div>
          {isMobile && <div className="mobile-header-actions">
            <SyncStatusButton syncDetails={syncDetails} onOpenStatus={loadSyncHistory} popoverId="mobile-sync-popover" />
            <MobileSettings
              groups={languageGroups}
              value={activeGroup}
              onGroupChange={chooseGroup}
              theme={theme}
              onThemeChange={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            />
          </div>}
          <div className="toolbar-actions">
            <div className="nav-buttons">
              <button className="icon-button" type="button" aria-label={view === "month" ? "Poprzedni miesiąc" : view === "week" ? "Poprzedni tydzień" : "Poprzedni dzień"} disabled={!canNavigate(-1)} onClick={() => navigate(-1)}><span className="control-face"><CaretLeft size={16} /></span></button>
              <button className="icon-button" type="button" aria-label={view === "month" ? "Następny miesiąc" : view === "week" ? "Następny tydzień" : "Następny dzień"} disabled={!canNavigate(1)} onClick={() => navigate(1)}><span className="control-face"><CaretRight size={16} /></span></button>
            </div>
          </div>
        </div>
        {view === "day" && <div className="mobile-date-strip" aria-label="Wybierz dzień">
          {currentWeek.map((day) => isCalendarDay(day) ? <button className={`${day === selectedDay ? "selected" : ""}${day === today ? " is-today" : ""}`} type="button" key={day} aria-pressed={day === selectedDay} aria-current={day === today ? "date" : undefined} onClick={() => selectDay(day)}><span>{formatWeekday(day)}</span><strong className={`date-circle${day === selectedDay ? " is-selected" : ""}`}>{parseDay(day).getUTCDate()}</strong></button> : <span className="mobile-date-unavailable" key={day} aria-hidden="true" />)}
        </div>}
        <div className="calendar-wrapper">
          <ViewSwitch view={view} onChange={selectView} className="mobile-view-switch" />
          {loading ? <div className="calendar-loading">Ładowanie planu…</div> : loadError && allEvents.length === 0 ? <div className="calendar-loading calendar-error"><span>Nie udało się wczytać planu.</span><button type="button" onClick={() => { setLoading(true); setRetryKey((value) => value + 1); }}>Spróbuj ponownie</button></div> : view === "month" ? <MonthGrid selectedDay={selectedDay} events={isMobile ? events : visibleClasses} isMobile={isMobile} onSelectDay={selectDay} onEventClick={setSelectedEvent} onSwipeMonth={navigate} /> : isMobile && view === "week" ? <MobileWeekTimeline selectedDay={selectedDay} events={events} now={now} onEventClick={setSelectedEvent} onWeekChange={selectDay} scrollTopRef={timelineScrollTopRef} /> : <CalendarTimeline days={days} selectedDay={selectedDay} events={isMobile ? events : visibleClasses} view={view} isMobileDay={isMobile && view === "day"} now={now} onEventClick={setSelectedEvent} onSwipeDay={navigate} scrollTopRef={timelineScrollTopRef} />}
        </div>
      </main>
      <EventDialog event={selectedEvent} onClose={closeEvent} />
    </div>
  );
}
