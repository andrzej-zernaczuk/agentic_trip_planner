import { useState } from "react";
import type { TripItem, TripPlan } from "../types";
import { agentMeta } from "../agents";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function formatDuration(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function Item({ item }: { item: TripItem }) {
  const cat = agentMeta(item.category);
  const agent = agentMeta(item.agent);
  const duration = formatDuration(item.duration_min);
  return (
    <li className="item" style={{ ["--c" as string]: cat.color }}>
      <div className="item-time">
        {item.time ?? <span className="flex">Flexible</span>}
        {duration && <small>{duration}</small>}
      </div>
      <div className="item-body">
        <div className="item-title">
          <span>{cat.icon}</span>
          <strong>{item.title}</strong>
          <span className="badge" style={{ ["--c" as string]: agent.color }}>
            {agent.label} agent
          </span>
        </div>
        <p>{item.description}</p>
        <div className="item-meta">
          {item.location && <span>📍 {item.location}</span>}
          {item.price_level && <span>{item.price_level}</span>}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/** Shows the first `limit` entries; the rest sit behind a "Show N more" toggle. */
function ShortList({ lines, limit }: { lines: string[]; limit: number }) {
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

export function Itinerary({ plan }: { plan: TripPlan }) {
  const [dayIdx, setDayIdx] = useState(0);
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];
  const highlights = Object.entries(plan.highlights ?? {}).filter(([, v]) => v.length > 0);

  return (
    <section className="itinerary">
      <header className="itin-head">
        <div>
          <h2>{plan.destination}</h2>
          <p className="dates">
            {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
          </p>
          <p>{plan.summary}</p>
        </div>
      </header>

      <div className="itin-grid">
        <div>
          <nav className="tabs">
            {plan.days.map((d, i) => (
              <button key={d.date} className={d === day ? "active" : ""} onClick={() => setDayIdx(i)}>
                <small>{formatDate(d.date)}</small>
                {d.title}
              </button>
            ))}
          </nav>
          {day ? (
            day.items.length ? (
              <ol className="items">
                {day.items.map((it, i) => (
                  <Item key={i} item={it} />
                ))}
              </ol>
            ) : (
              <p className="empty">Free day, nothing scheduled.</p>
            )
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
    </section>
  );
}
