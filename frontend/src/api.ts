import type { PlanRequest, SwarmEvent, TripPlan } from "./types";
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
    ...specialists.map((a, i): [number, SwarmEvent] => [3500 + i * 1100, { type: "agent_finished", agent: a, message: finished[a] }]),
    [4000 + n * 1100, { type: "log", agent: "coordinator", message: `Merging results into ${plan.days.length} days` }],
    [5500 + n * 1100, { type: "agent_finished", agent: "coordinator", message: "Plan ready" }],
    [5600 + n * 1100, { type: "result", plan }],
  ];

  const timers = events.map(([ms, e]) => setTimeout(() => onEvent(e), ms));
  return () => timers.forEach(clearTimeout);
}
