import { Fragment, useState, type DragEvent, type FormEvent, type LiHTMLAttributes, type ReactNode } from "react";
import type { Category, TripItem, TripPlan } from "../types";
import { agentMeta } from "../agents";
import { formatDate, formatDuration } from "../format";
import {
  USER_AGENT,
  addItem,
  moveItem,
  neighbourIndex,
  removeItem,
  setLocked,
  setTime,
  type EditDay,
  type EditItem,
  type Scheduled,
  type ShownTimes,
} from "../planEdits";
import type { Leg } from "../travel";

interface ItemProps {
  item: TripItem;
  /** Replaces the read-only time column (edit mode puts a time input here). */
  timeSlot?: ReactNode;
  /** Extra row under the item (edit controls, "Add to plan", warnings). */
  footer?: ReactNode;
  liProps?: LiHTMLAttributes<HTMLLIElement>;
}

export function Item({ item, timeSlot, footer, liProps }: ItemProps) {
  const cat = agentMeta(item.category);
  const agent = agentMeta(item.agent);
  const duration = formatDuration(item.duration_min);
  return (
    <li {...liProps} className={`item ${liProps?.className ?? ""}`} style={{ ["--c" as string]: cat.color }}>
      <div className="item-time">
        {timeSlot ?? item.time ?? <span className="flex">Flexible</span>}
        {duration && <small>{duration}</small>}
      </div>
      <div className="item-body">
        <div className="item-title">
          <span>{cat.icon}</span>
          <strong>{item.title}</strong>
          <span className="badge" style={{ ["--c" as string]: agent.color }}>
            {item.agent === USER_AGENT ? "Added by you" : `${agent.label} agent`}
          </span>
        </div>
        {item.description && <p>{item.description}</p>}
        <div className="item-meta">
          {item.location && <span>📍 {item.location}</span>}
          {item.price_level && <span>{item.price_level}</span>}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          )}
        </div>
        {footer}
      </div>
    </li>
  );
}

/** Shows the first `limit` entries; the rest sit behind a "Show N more" toggle. */
export function ShortList({ lines, limit }: { lines: string[]; limit: number }) {
  const [open, setOpen] = useState(false);
  const hidden = lines.length - limit;
  return (
    <>
      <ul>
        {(open ? lines : lines.slice(0, limit)).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {hidden > 0 && (
        <button className="more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

const CATEGORIES: Category[] = ["sights", "food", "football", "other"];

function AddActivity({ onAdd }: { onAdd: (item: TripItem) => void }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  if (!open)
    return (
      <button className="add-btn" onClick={() => setOpen(true)}>
        + Add activity
      </button>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      time: time || null,
      duration_min: duration ? Math.max(5, Number(duration)) : null,
      title: title.trim(),
      description: description.trim(),
      category,
      agent: USER_AGENT,
      location: location.trim() || null,
      price_level: null,
      source_url: null,
    });
    setTitle("");
    setTime("");
    setDuration("");
    setLocation("");
    setDescription("");
    setOpen(false);
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <input aria-label="Title" placeholder="What? e.g. Flamenco show" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <input aria-label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <input aria-label="Duration (min)" type="number" min={5} step={5} placeholder="min" value={duration} onChange={(e) => setDuration(e.target.value)} />
      <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {agentMeta(c).icon} {agentMeta(c).label}
          </option>
        ))}
      </select>
      <input aria-label="Location" placeholder="Where?" value={location} onChange={(e) => setLocation(e.target.value)} />
      <input aria-label="Notes" className="wide" placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="add-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" disabled={!title.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

/** The commute line between two activities, with a warning when the gap is too short. */
function LegRow({ leg, short, onDragOver, onDrop }: {
  leg: Leg;
  short: number | null;
  onDragOver?: (e: DragEvent<HTMLLIElement>) => void;
  onDrop?: (e: DragEvent<HTMLLIElement>) => void;
}) {
  const km = leg.km === null ? "" : ` · ${leg.km < 1 ? `${Math.round(leg.km * 1000)} m` : `${leg.km.toFixed(1)} km`}`;
  const text =
    leg.mode === "walk"
      ? `🚶 ${leg.minutes} min walk${km}`
      : leg.mode === "transit"
        ? `🚇 ~${leg.minutes} min by transit or taxi${km}`
        : `↔ ~${leg.minutes} min to get there (couldn't locate one of the places)`;
  const warn =
    short === null ? null : short < 0 ? `⚠ Overlaps the previous activity by ${-short} min` : `⚠ Only ${short} min to get there`;
  return (
    <li className={`leg ${warn ? "warn" : ""}`} onDragOver={onDragOver} onDrop={onDrop}>
      {text}
      {warn && <strong>{warn}</strong>}
    </li>
  );
}

interface Props {
  plan: TripPlan;
  days: EditDay[];
  /** Shown times and commutes per day (scheduleDay), computed by the parent. */
  schedules: Scheduled[][];
  shown: ShownTimes;
  /** Places still being located; commutes use rough defaults until then. */
  lookingUp: number;
  modified: boolean;
  onChange: (days: EditDay[]) => void;
  onReset: () => void;
}

type DropHint = { id: string; after: boolean } | null;

export function Itinerary({ plan, days, schedules, shown, lookingUp, modified, onChange, onReset }: Props) {
  const [dayIdx, setDayIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint>(null);
  const [tabHint, setTabHint] = useState<number | null>(null);
  const d = Math.min(dayIdx, days.length - 1);
  const day = days[d];
  const sched = schedules[d] ?? [];
  const highlights = Object.entries(plan.highlights ?? {}).filter(([, v]) => v.length > 0);

  const endDrag = () => {
    setDragId(null);
    setDropHint(null);
    setTabHint(null);
  };
  const dropOnItem = (target: EditItem, idx: number, after: boolean) => {
    if (dragId && dragId !== target.id) onChange(moveItem(days, dragId, d, idx + (after ? 1 : 0), shown));
    endDrag();
  };
  const dropOnDay = (k: number) => {
    if (dragId) onChange(moveItem(days, dragId, k, days[k].items.length, shown));
    endDrag();
  };

  const editControls = (it: EditItem) => {
    // ↑/↓ swap with the nearest movable neighbour; locked items keep their slot.
    const up = it.locked ? null : neighbourIndex(day.items, it.id, -1);
    const down = it.locked ? null : neighbourIndex(day.items, it.id, 1);
    return (
      <div className="edit-row">
        <button title="Move up" aria-label="Move up" disabled={up === null} onClick={() => onChange(moveItem(days, it.id, d, up!, shown))}>
          ↑
        </button>
        <button title="Move down" aria-label="Move down" disabled={down === null} onClick={() => onChange(moveItem(days, it.id, d, down!, shown))}>
          ↓
        </button>
        <select
          aria-label="Move to day"
          value=""
          onChange={(e) => {
            const k = Number(e.target.value);
            onChange(moveItem(days, it.id, k, days[k].items.length, shown));
          }}
        >
          <option value="" disabled>
            Move to…
          </option>
          {days.map((other, k) =>
            k === d ? null : (
              <option key={other.date} value={k}>
                {formatDate(other.date)}
              </option>
            ),
          )}
        </select>
        {it.slot && (
          <button
            className={it.locked ? "locked" : ""}
            aria-label={it.locked ? "Unlock time" : "Lock time"}
            title={it.locked ? "Fixed time: reordering won't change it. Click to unlock." : "Click to keep this time fixed when reordering."}
            onClick={() => onChange(setLocked(days, it.id, !it.locked, shown))}
          >
            {it.locked ? "🔒 Fixed time" : "🔓 Lock time"}
          </button>
        )}
        <button className="danger" title="Remove" aria-label="Remove" onClick={() => onChange(removeItem(days, it.id))}>
          ✕ Remove
        </button>
      </div>
    );
  };

  return (
    <div>
      <header className="itin-head">
        <div>
          <h2>{plan.destination}</h2>
          <p className="dates">
            {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
          </p>
          <p>{plan.summary}</p>
        </div>
        <div className="edit-toolbar">
          {modified && <span className="edited-tag">Edited</span>}
          {modified && (
            <button className="ghost" onClick={onReset}>
              Reset to original
            </button>
          )}
          <button className={editing ? "" : "secondary"} onClick={() => setEditing(!editing)}>
            {editing ? "✓ Done editing" : "✏️ Edit plan"}
          </button>
        </div>
      </header>

      <div className="itin-grid">
        <div>
          {editing && (
            <p className="edit-hint">
              Drag activities to reorder them, or drop one on another day's tab to move it there. An edited day
              is rescheduled back to back with travel time between places (lunch from 12:30, dinner from
              19:30); 🔒 items keep their time, and typing a time locks it.
            </p>
          )}
          <nav className="tabs">
            {days.map((dd, k) => (
              <button
                key={dd.date}
                className={`${k === d ? "active" : ""} ${tabHint === k ? "drop-target" : ""}`}
                onClick={() => setDayIdx(k)}
                onDragOver={(e) => {
                  if (!dragId || k === d) return;
                  e.preventDefault();
                  setTabHint(k);
                }}
                onDragLeave={() => setTabHint(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnDay(k);
                }}
              >
                <small>
                  {formatDate(dd.date)}
                  {editing && ` · ${dd.items.length}`}
                </small>
                {dd.title}
              </button>
            ))}
          </nav>

          {lookingUp > 0 && <p className="geo-status">📍 Locating {lookingUp} places for travel times…</p>}
          {day ? (
            <>
              {day.auto && <p className="geo-status">⏱ Rescheduled: back to back, with travel time between places.</p>}
              {day.items.length ? (
                <ol
                  className="items"
                  onDragOver={(e) => editing && dragId && e.preventDefault()}
                  onDrop={(e) => {
                    // Dropped in the gaps or below the last item: move to the end of this day.
                    if (e.target === e.currentTarget) {
                      e.preventDefault();
                      if (dragId) onChange(moveItem(days, dragId, d, day.items.length, shown));
                      endDrag();
                    }
                  }}
                >
                  {sched.map(({ item: it, time, leg: lg, short }, i) => (
                    <Fragment key={it.id}>
                    {lg && (
                      <LegRow
                        leg={lg}
                        short={short}
                        // Dropping on the commute line puts the activity between those two.
                        onDragOver={editing && dragId ? (e) => e.preventDefault() : undefined}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragId) onChange(moveItem(days, dragId, d, i, shown));
                          endDrag();
                        }}
                      />
                    )}
                    <Item
                      item={{ ...it, time }}
                      timeSlot={
                        editing ? (
                          <input
                            className="time-input"
                            type="time"
                            aria-label="Time"
                            value={time ?? ""}
                            onChange={(e) => onChange(setTime(days, it.id, e.target.value || null, shown))}
                          />
                        ) : it.locked ? (
                          <span title="Fixed time">🔒 {time}</span>
                        ) : undefined
                      }
                      footer={editing && editControls(it)}
                      liProps={
                        editing
                          ? {
                              draggable: !it.locked,
                              title: it.locked ? "Fixed time: unlock it to drag, or use “Move to…”" : undefined,
                              className: [
                                it.locked ? "editable fixed" : "editable",
                                dragId === it.id ? "dragging" : "",
                                dropHint?.id === it.id ? (dropHint.after ? "drop-after" : "drop-before") : "",
                              ].join(" "),
                              onDragStart: (e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", it.id);
                                setDragId(it.id);
                              },
                              onDragEnd: endDrag,
                              onDragOver: (e) => {
                                if (!dragId) return;
                                e.preventDefault();
                                const r = e.currentTarget.getBoundingClientRect();
                                const after = e.clientY > r.top + r.height / 2;
                                if (dropHint?.id !== it.id || dropHint.after !== after) setDropHint({ id: it.id, after });
                              },
                              onDrop: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                dropOnItem(it, i, dropHint?.id === it.id ? dropHint.after : false);
                              },
                            }
                          : undefined
                      }
                    />
                    </Fragment>
                  ))}
                </ol>
              ) : (
                <p
                  className={`empty ${editing && dragId ? "drop-zone" : ""}`}
                  onDragOver={(e) => editing && dragId && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOnDay(d);
                  }}
                >
                  {editing ? "Nothing planned yet. Drop an activity here or add one below." : "Free day, nothing scheduled."}
                </p>
              )}
              {editing && <AddActivity key={day.date} onAdd={(item) => onChange(addItem(days, d, item, true, shown))} />}
            </>
          ) : (
            <p className="empty">The coordinator returned no days.</p>
          )}
        </div>

        <aside className="side">
          {highlights.length > 0 && (
            <div className="panel">
              <h3>Highlights</h3>
              {highlights.map(([agent, lines]) => (
                <div key={agent} className="hl">
                  <h4>
                    {agentMeta(agent).icon} {agentMeta(agent).label}
                  </h4>
                  <ShortList lines={lines} limit={3} />
                </div>
              ))}
            </div>
          )}
          {plan.warnings?.length > 0 && (
            <div className="panel warn">
              <h3>⚠️ Warnings</h3>
              <ShortList lines={plan.warnings} limit={4} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
