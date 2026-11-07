import { useEffect, useRef, useState } from "react";
import type { AgentState, PlanRequest, SpecialistResult, SwarmEvent, TripPlan } from "./types";
import { USE_MOCK, startPlan, streamPlan } from "./api";
import { TripForm } from "./components/TripForm";
import { AgentProgress } from "./components/AgentProgress";
import { Results } from "./components/Results";

type Phase = "form" | "running" | "done" | "error";

export default function App() {
  const [phase, setPhase] = useState<Phase>("form");
  const [agents, setAgents] = useState<Record<string, AgentState>>({});
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, SpecialistResult>>({});
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [runId, setRunId] = useState(0); // remounts Results (and its tab choice) per trip
  const [error, setError] = useState<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribe.current?.(), []);

  const handleEvent = (e: SwarmEvent) => {
    switch (e.type) {
      case "agent_started":
        setAgents((a) => ({ ...a, [e.agent]: { status: "working", message: e.message } }));
        break;
      case "agent_finished":
        setAgents((a) => ({ ...a, [e.agent]: { status: "done", message: e.message } }));
        break;
      case "agent_result":
        setResults((r) => ({ ...r, [e.agent]: e.result }));
        break;
      case "log":
        setLog((l) => [...l, e.message]);
        setAgents((a) => (a[e.agent] ? { ...a, [e.agent]: { ...a[e.agent], message: e.message } } : a));
        break;
      case "result":
        setPlan(e.plan);
        setPhase("done");
        break;
      case "error":
        setError(e.message);
        setAgents((a) =>
          Object.fromEntries(
            Object.entries(a).map(([k, s]) => [k, s.status === "working" ? { ...s, status: "error" } : s]),
          ),
        );
        setPhase("error");
        break;
    }
  };

  const submit = async (req: PlanRequest) => {
    unsubscribe.current?.();
    setPlan(null);
    setResults({});
    setRunId((n) => n + 1);
    setError(null);
    setLog([]);
    setAgents({
      coordinator: { status: "idle", message: "" },
      ...Object.fromEntries(req.interests.map((i) => [i, { status: "idle", message: "" } as AgentState])),
    });
    setPhase("running");
    try {
      const id = await startPlan(req);
      unsubscribe.current = streamPlan(id, req, handleEvent);
    } catch (err) {
      handleEvent({ type: "error", message: (err as Error).message });
    }
  };

  return (
    <main>
      <header className="top">
        <h1>
          🐝 Wanderswarm <small>a travel agent swarm</small>
        </h1>
        {USE_MOCK && <span className="mock-tag">mock mode</span>}
      </header>

      <TripForm disabled={phase === "running"} onSubmit={submit} />

      {phase !== "form" && <AgentProgress agents={agents} log={log} />}
      {error && <div className="error-banner">{error}</div>}
      {phase !== "form" && <Results key={runId} agents={agents} results={results} plan={plan} error={error} />}
    </main>
  );
}
