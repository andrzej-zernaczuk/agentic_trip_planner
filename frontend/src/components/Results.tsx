import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentState, SpecialistResult, TripItem, TripPlan } from "../types";
import { agentMeta } from "../agents";
import { geocode } from "../api";
import { formatDate } from "../format";
import { addItem, dayForDate, scheduleDay, shownTimes, withIds, type EditDay, type EditItem } from "../planEdits";
import { leg, placeKey, type LatLng } from "../travel";
import { AgentPicks } from "./AgentPicks";
import { Itinerary } from "./Itinerary";

interface Props {
  agents: Record<string, AgentState>;
  results: Record<string, SpecialistResult>;
  plan: TripPlan | null;
  error: string | null;
}

const PLAN = "plan";
const GEO_RETRY_MS = 10_000;
const MAX_GEO_RETRIES = 6;

/**
 * Top-level tabs: the merged plan plus one tab per specialist. A specialist's tab opens as soon as
 * its picks arrive, so people can browse while the coordinator is still merging.
 */
export function Results({ agents, results, plan, error }: Props) {
  // Until the user clicks a tab, follow the data: first agent with picks, then the plan when it lands.
  const [picked, setPicked] = useState<string | null>(null);
  const specialists = Object.keys(agents).filter((a) => a !== "coordinator");
  const firstReady = specialists.find((a) => results[a]);
  const active = picked ?? (plan ? PLAN : (firstReady ?? PLAN));

  // The traveller's editable copy of the plan. Lives here (not in Itinerary) so edits survive tab
  // switches; `null` means "unedited", i.e. show the coordinator's plan as is.
  const original = useMemo(() => (plan ? withIds(plan.days) : null), [plan]);
  const [edited, setEdited] = useState<EditDay[] | null>(null);
  const days = edited ?? original;
  // "agent:index" of picks already added to the plan -> the day they went to.
  const [added, setAdded] = useState<Record<string, string>>({});

  // Coordinates per place, for commute estimates. Every place in the plan (including ones added
  // later) is looked up once; the backend has usually cached them while the coordinator merged.
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const requested = useRef(new Set<string>());
  // Bumped to re-run the lookup effect for places the geocoder couldn't get to yet.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!plan || !days) return;
    const missing = new Map<string, { key: string; title: string; location: string | null }>();
    for (const it of days.flatMap((d) => d.items)) {
      const key = placeKey(it);
      if (!requested.current.has(key)) missing.set(key, { key, title: it.title, location: it.location });
    }
    if (missing.size === 0) return;
    const places = [...missing.values()];
    places.forEach((pl) => requested.current.add(pl.key));
    const giveUp = retry >= MAX_GEO_RETRIES;
    geocode(plan.destination, places)
      .then(({ places: found, pending }) => {
        setCoords((c) => ({ ...c, ...found, ...(giveUp ? Object.fromEntries(pending.map((k) => [k, null])) : {}) }));
        if (pending.length && !giveUp) {
          pending.forEach((k) => requested.current.delete(k));
          setTimeout(() => setRetry((n) => n + 1), GEO_RETRY_MS);
        }
      })
      // Backend unreachable: record "unknown" so commutes fall back to rough defaults.
      .catch(() => setCoords((c) => ({ ...c, ...Object.fromEntries(places.map((pl) => [pl.key, null])) })));
  }, [plan, days, retry]);
  // Places in the plan with no answer yet (found or not).
  const lookingUp = days ? new Set(days.flatMap((d) => d.items.map(placeKey)).filter((k) => !(k in coords))).size : 0;

  const schedules = useMemo(() => {
    const legFor = (a: EditItem, b: EditItem) => leg(coords[placeKey(a)], coords[placeKey(b)]);
    return days ? days.map((d) => scheduleDay(d, legFor)) : [];
  }, [days, coords]);
  const shown = useMemo(() => shownTimes(schedules), [schedules]);

  const addPick = (key: string, item: TripItem, date: string | null | undefined) => {
    if (!days) return;
    const k = dayForDate(days, date);
    setEdited(addItem(days, k, item, false, shown));
    setAdded((a) => ({ ...a, [key]: formatDate(days[k].date) }));
  };
  const reset = () => {
    setEdited(null);
    setAdded({});
  };

  if (!plan && !firstReady && !error) return null; // nothing to browse yet; AgentProgress covers it

  return (
    <section className="itinerary">
      <nav className="tabs top-tabs">
        <button
          className={`${active === PLAN ? "active" : ""} ${plan && active !== PLAN ? "fresh" : ""}`}
          onClick={() => setPicked(PLAN)}
        >
          <small>{plan ? "Ready" : error ? "Failed" : "Building…"}</small>
          📅 Day-by-day plan
        </button>
        {specialists.map((a) => {
          const meta = agentMeta(a);
          const r = results[a];
          const status = agents[a]?.status;
          const label = r ? `${r.items.length} picks` : status === "done" ? "Done" : status === "error" ? "Failed" : "Working…";
          return (
            <button
              key={a}
              className={`${active === a ? "active" : ""} ${r ? "" : "pending"}`}
              disabled={!r}
              onClick={() => setPicked(a)}
              style={{ ["--c" as string]: meta.color }}
            >
              <small>{label}</small>
              {meta.icon} {meta.label}
            </button>
          );
        })}
      </nav>

      {active === PLAN ? (
        plan && days ? (
          <Itinerary
            plan={plan}
            days={days}
            schedules={schedules}
            shown={shown}
            lookingUp={lookingUp}
            modified={edited !== null}
            onChange={setEdited}
            onReset={reset}
          />
        ) : (
          <p className="empty">
            {error
              ? "The coordinator couldn't finish the plan. The specialists' picks are still in their tabs."
              : "The coordinator is building the day-by-day plan. Meanwhile, browse the specialists' picks in their tabs."}
          </p>
        )
      ) : (
        results[active] && (
          <AgentPicks
            result={results[active]}
            canAdd={days !== null}
            added={added}
            onAdd={(i, item, date) => addPick(`${active}:${i}`, item, date)}
          />
        )
      )}
    </section>
  );
}
