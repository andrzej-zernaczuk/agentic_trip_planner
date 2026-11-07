// Pure helpers for editing the day-by-day plan in the browser. Nothing here talks to the backend:
// edits live in memory and `TripPlan` from the API is never mutated.
//
// What's stored is the order of each day plus, per item, its `slot` (the time the coordinator
// planned, or one the traveller typed) and whether it's 🔒 locked. Shown times are *derived* by
// scheduleDay(), so they update as soon as commute estimates arrive:
// - A day nobody touched shows the coordinator's times, plus commutes and "not enough time" warnings.
// - Once a day is edited it is rescheduled back to back: it starts at the day's original start
//   time; each activity starts when the previous one ends plus the commute between them; lunch
//   doesn't start before 12:30 and dinner not before 19:30; 🔒 items keep their slot.
// - Typing a time locks the item at that time (you asked for it).

import type { TripDay, TripItem } from "./types";
import type { Leg } from "./travel";

/** A plan item plus a client-side id (React keys, drag & drop), its planned start and a fixed-time flag. */
export type EditItem = TripItem & { id: string; slot: string | null; locked: boolean };
/** `start`: the day's original first start time. `auto`: edited, so times are recomputed back to back. */
export type EditDay = Omit<TripDay, "items"> & { items: EditItem[]; start: string | null; auto: boolean };

export interface Scheduled {
  item: EditItem;
  /** Shown start time, null for flexible items. */
  time: string | null;
  /** Commute from the previous timed activity, null for the first one (and flexible items). */
  leg: Leg | null;
  /** Minutes available to get here when that's less than the commute needs (or an outright overlap). */
  short: number | null;
}

/** The agent key for activities the traveller added by hand. */
export const USER_AGENT = "you";

/** Assumed length of an activity without `duration_min`. */
const DEFAULT_MIN = 60;
const LUNCH_FROM = 12 * 60 + 30;
const DINNER_FROM = 19 * 60 + 30;
const LAST_START = 23 * 60 + 59;

let seq = 0;
const newId = () => `it${++seq}`;

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => {
  const c = Math.min(Math.max(0, Math.round(m)), LAST_START);
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};
const ceil5 = (m: number) => Math.ceil(m / 5) * 5;
const length = (it: TripItem) => it.duration_min ?? DEFAULT_MIN;

/** Kick-offs are fixed: a match (or a screening of one) can't be moved to another hour. */
function isFixture(item: TripItem): boolean {
  return item.category === "football" && /\bvs?\.?\s|\bmatch\b/i.test(item.title);
}

/** Lunch or dinner, judged by the time it was planned for. Breakfast/snacks before 11:00 have no window. */
function mealFrom(it: EditItem): number {
  if (it.category !== "food" || !it.slot) return 0;
  const m = toMin(it.slot);
  if (m < 11 * 60) return 0;
  return m < 17 * 60 ? LUNCH_FROM : DINNER_FROM;
}

function toEdit(item: TripItem, locked = Boolean(item.time) && isFixture(item)): EditItem {
  return { ...item, id: newId(), slot: item.time, locked };
}

export function withIds(days: TripDay[]): EditDay[] {
  return days.map((d) => {
    const slots = d.items.map((i) => i.time).filter((t): t is string => Boolean(t));
    const start = slots.length ? fromMin(Math.min(...slots.map(toMin))) : null;
    return { ...d, items: d.items.map((i) => toEdit(i)), start, auto: false };
  });
}

/** Shown times and commutes for one day. `legFor` estimates the commute between two activities. */
export function scheduleDay(day: EditDay, legFor: (a: EditItem, b: EditItem) => Leg): Scheduled[] {
  let prev: EditItem | null = null;
  let prevEnd = 0;
  return day.items.map((item) => {
    if (!item.slot) return { item, time: null, leg: null, short: null };
    const lg = prev ? legFor(prev, item) : null;
    const earliest = prev ? prevEnd + lg!.minutes : -Infinity;
    let start: number;
    if (!day.auto || item.locked) start = toMin(item.slot);
    else if (!prev) start = Math.max(toMin(day.start ?? item.slot), mealFrom(item));
    else start = ceil5(Math.max(earliest, mealFrom(item)));
    const short = prev && start < earliest ? start - prevEnd : null;
    prev = item;
    prevEnd = start + length(item);
    return { item, time: fromMin(start), leg: lg, short };
  });
}

/** Shown time per item id across all days, for inserting new or moved items at the right place. */
export type ShownTimes = Map<string, string | null>;

export function shownTimes(schedules: Scheduled[][]): ShownTimes {
  return new Map(schedules.flat().map((s) => [s.item.id, s.time]));
}

/** Inserts before the first timed item that's shown later (end of the list if none or untimed). */
function insertByTime(items: EditItem[], item: EditItem, shown: ShownTimes): EditItem[] {
  const t = item.slot;
  const at = t
    ? items.findIndex((it) => {
        const s = shown.get(it.id) ?? it.slot;
        return s !== null && s !== undefined && toMin(s) > toMin(t);
      })
    : -1;
  const next = [...items];
  next.splice(at === -1 ? next.length : at, 0, item);
  return next;
}

export function locate(days: EditDay[], id: string): [number, number] | null {
  for (let d = 0; d < days.length; d++) {
    const i = days[d].items.findIndex((it) => it.id === id);
    if (i !== -1) return [d, i];
  }
  return null;
}

/** Replaces day `d`'s items and marks it edited (rescheduled back to back from now on). */
function replaceDay(days: EditDay[], d: number, items: EditItem[]): EditDay[] {
  return days.map((day, k) => (k === d ? { ...day, items, auto: true } : day));
}

/**
 * Moves item `id` before the item currently at `toIdx` of day `toDay` (end of the day if `toIdx` is
 * past the end; indices refer to the list before the move). On another day a timed item is placed
 * by its time, so a lunch lands among that day's lunchtime activities.
 */
export function moveItem(days: EditDay[], id: string, toDay: number, toIdx: number, shown: ShownTimes): EditDay[] {
  const from = locate(days, id);
  if (!from) return days;
  const [fromDay, fromIdx] = from;
  const item = days[fromDay].items[fromIdx];
  const next = replaceDay(days, fromDay, days[fromDay].items.filter((it) => it.id !== id));
  const target = [...next[toDay].items];
  if (fromDay === toDay || !item.slot) {
    const at = fromDay === toDay && fromIdx < toIdx ? toIdx - 1 : toIdx;
    target.splice(Math.max(0, Math.min(at, target.length)), 0, item);
    return replaceDay(next, toDay, target);
  }
  return replaceDay(next, toDay, insertByTime(target, item, shown));
}

/** The index to pass to moveItem to swap `id` with its nearest movable neighbour (-1 = up, 1 = down), or null. */
export function neighbourIndex(items: EditItem[], id: string, dir: -1 | 1): number | null {
  const i = items.findIndex((it) => it.id === id);
  for (let j = i + dir; j >= 0 && j < items.length; j += dir) {
    if (!items[j].locked) return dir === -1 ? j : j + 1;
  }
  return null;
}

export function removeItem(days: EditDay[], id: string): EditDay[] {
  const at = locate(days, id);
  if (!at) return days;
  return replaceDay(days, at[0], days[at[0]].items.filter((it) => it.id !== id));
}

/** Locking fixes the item at the time it's shown now; unlocking lets it flow with the others. */
export function setLocked(days: EditDay[], id: string, locked: boolean, shown: ShownTimes): EditDay[] {
  const at = locate(days, id);
  if (!at) return days;
  const items = days[at[0]].items.map((it) =>
    it.id === id ? { ...it, locked, slot: locked ? (shown.get(id) ?? it.slot) : it.slot } : it,
  );
  return replaceDay(days, at[0], items);
}

/** A typed time fixes the item there (🔒) and moves it to its place in the day; null makes it flexible. */
export function setTime(days: EditDay[], id: string, time: string | null, shown: ShownTimes): EditDay[] {
  const at = locate(days, id);
  if (!at) return days;
  const item = { ...days[at[0]].items[at[1]], slot: time, locked: time !== null };
  const rest = days[at[0]].items.filter((it) => it.id !== id);
  return replaceDay(days, at[0], time ? insertByTime(rest, item, shown) : [...rest, item]);
}

/**
 * Adds an item to day `d` at its time (end of the day if it has none). `locked`: the traveller
 * typed that time, so keep it; picks from a specialist flow like the coordinator's items.
 */
export function addItem(days: EditDay[], d: number, item: TripItem, locked: boolean, shown: ShownTimes): EditDay[] {
  return replaceDay(days, d, insertByTime(days[d].items, toEdit(item, locked && Boolean(item.time)), shown));
}

/** The day a specialist suggested, or the first day if it suggested none (or one outside the trip). */
export function dayForDate(days: EditDay[], date: string | null | undefined): number {
  const i = days.findIndex((d) => d.date === date);
  return i === -1 ? 0 : i;
}

