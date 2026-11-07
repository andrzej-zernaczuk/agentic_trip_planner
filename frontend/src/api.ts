import type { PlanRequest, SpecialistResult, SwarmEvent, TripPlan } from "./types";
import type { LatLng } from "./travel";
import mockPlan from "./mock/plan.json";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function startPlan(req: PlanRequest): Promise<string> {
  if (USE_MOCK) return "mock01";
  const r = await fetch(`${API}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`POST /api/plan failed: ${r.status}`);
  return (await r.json()).plan_id;
}

/** Subscribes to the plan's event stream. Returns an unsubscribe function. */
export function streamPlan(
  id: string,
  req: PlanRequest,
  onEvent: (e: SwarmEvent) => void,
): () => void {
  if (USE_MOCK) return replayMock(req, onEvent);

  let finished = false;
  const es = new EventSource(`${API}/api/plan/${id}/events`);
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as SwarmEvent;
    onEvent(e);
    if (e.type === "result" || e.type === "error") {
      finished = true;
      es.close();
    }
  };
  es.onerror = () => {
    if (finished) return;
    es.close();
    // SSE dropped: fall back to polling the result endpoint (README 4.3).
    pollPlan(id).then(
      (plan) => onEvent({ type: "result", plan }),
      (err: Error) => onEvent({ type: "error", message: err.message }),
    );
  };
  return () => {
    finished = true;
    es.close();
  };
}

async function pollPlan(id: string): Promise<TripPlan> {
  for (;;) {
    const r = await fetch(`${API}/api/plan/${id}`);
    if (r.status === 200) return r.json();
    if (r.status !== 202) throw new Error(`Lost connection to plan ${id} (${r.status})`);
    await new Promise((res) => setTimeout(res, 2000));
  }
}

export interface GeocodeResult {
  /** Coordinates per place key; null = not found. */
  places: Record<string, LatLng | null>;
  /** Keys not looked up because the geocoder was busy or down: ask again later. */
  pending: string[];
}

/** Mock mode has no geocoder: every place is "not found" and commutes use rough defaults. */
export async function geocode(
  destination: string,
  places: { key: string; title: string; location: string | null }[],
): Promise<GeocodeResult> {
  if (USE_MOCK || places.length === 0) return { places: Object.fromEntries(places.map((p) => [p.key, null])), pending: [] };
  const r = await fetch(`${API}/api/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, places }),
  });
  if (!r.ok) throw new Error(`POST /api/geocode failed: ${r.status}`);
  return r.json();
}

export function docxUrl(id: string): string {
  return `${API}/api/plan/${id}/docx`;
}

function replayMock(req: PlanRequest, onEvent: (e: SwarmEvent) => void): () => void {
  const city = req.destination.split(",")[0] || "the city";
  const specialists = req.interests;
  const plan = {
    ...(mockPlan as TripPlan),
    agents_used: specialists,
    days: (mockPlan as TripPlan).days.map((d) => ({
      ...d,
      items: d.items.filter((i) => (specialists as string[]).includes(i.agent)),
    })),
  };

  const started: Record<string, string> = {
    sights: `Looking for must-see spots in ${city}`,
    food: `Looking for local dishes in ${city}`,
    football: `Checking fixtures for ${req.start_date} – ${req.end_date}`,
  };
  const finished: Record<string, string> = {
    sights: "Found 7 attractions",
    food: "Found 6 places",
    football: "Found 1 home match",
  };

  // [delay ms, event]: specialists start together and finish staggered, like the real swarm.
  const n = specialists.length;
  const events: [number, SwarmEvent][] = [
    [300, { type: "agent_started", agent: "coordinator", message: `Planning ${city}` }],
    ...specialists.map((a, i): [number, SwarmEvent] => [800 + i * 250, { type: "log", agent: "coordinator", message: `Briefing ${a}` }]),
    ...specialists.map((a): [number, SwarmEvent] => [1000 + n * 250, { type: "agent_started", agent: a, message: started[a] }]),
    ...specialists.flatMap((a, i): [number, SwarmEvent][] => [
      [3500 + i * 1100, { type: "agent_finished", agent: a, message: finished[a] }],
      [3500 + i * 1100, { type: "agent_result", agent: a, result: mockResult(plan, a) }],
    ]),
    [4000 + n * 1100, { type: "log", agent: "coordinator", message: `Merging results into ${plan.days.length} days` }],
    // Long merge on purpose, so the specialists' tabs can be browsed before the plan lands.
    [8500 + n * 1100, { type: "agent_finished", agent: "coordinator", message: "Plan ready" }],
    [8600 + n * 1100, { type: "result", plan }],
  ];

  const timers = events.map(([ms, e]) => setTimeout(() => onEvent(e), ms));
  return () => timers.forEach(clearTimeout);
}

/** Rebuilds a specialist's raw picks from the mock plan (mirrors mock_specialist_result in main.py). */
function mockResult(plan: TripPlan, agent: string): SpecialistResult {
  return {
    agent,
    items: plan.days.flatMap((d) =>
      d.items
        .filter((i) => i.agent === agent)
        .map((i) => ({ ...i, preferred_date: d.date, preferred_time: i.time })),
    ),
    highlights: plan.highlights[agent] ?? [],
    warnings: [],
  };
}
