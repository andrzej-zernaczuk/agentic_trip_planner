import type { AgentState } from "../types";
import { agentMeta } from "../agents";

interface Props {
  agents: Record<string, AgentState>;
  log: string[];
}

const STATUS_LABEL = { idle: "Waiting", working: "Working…", done: "Done", error: "Error" } as const;

function AgentCard({ id, state }: { id: string; state: AgentState }) {
  const meta = agentMeta(id);
  return (
    <div className={`agent-card ${state.status}`} style={{ ["--c" as string]: meta.color }}>
      <div className="agent-head">
        <span className="agent-icon">{meta.icon}</span>
        <strong>{meta.label}</strong>
        <span className="agent-status">{STATUS_LABEL[state.status]}</span>
      </div>
      <p className="agent-msg">{state.message || " "}</p>
    </div>
  );
}

export function AgentProgress({ agents, log }: Props) {
  const { coordinator, ...specialists } = agents;
  return (
    <section className="progress">
      <div className="coord-row">{coordinator && <AgentCard id="coordinator" state={coordinator} />}</div>
      <div className="specialist-row">
        {Object.entries(specialists).map(([id, s]) => (
          <AgentCard key={id} id={id} state={s} />
        ))}
      </div>
      {log.length > 0 && (
        <ul className="log">
          {log.slice(-5).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
