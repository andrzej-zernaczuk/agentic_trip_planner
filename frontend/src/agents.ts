// Display metadata per agent / category. Unknown agents (stretch ones) fall back to DEFAULT_META.

export interface AgentMeta {
  label: string;
  icon: string;
  color: string;
}

export const AGENT_META: Record<string, AgentMeta> = {
  coordinator: { label: "Coordinator", icon: "🧭", color: "#6366f1" },
  sights: { label: "Sights", icon: "🏛️", color: "#0ea5e9" },
  food: { label: "Food", icon: "🥘", color: "#f97316" },
  football: { label: "Football", icon: "⚽", color: "#22c55e" },
  critic: { label: "Critic", icon: "🔍", color: "#a855f7" },
  other: { label: "Other", icon: "📍", color: "#64748b" },
  you: { label: "You", icon: "✍️", color: "#db2777" },
};

const DEFAULT_META: AgentMeta = { label: "Agent", icon: "🤖", color: "#64748b" };

export function agentMeta(key: string): AgentMeta {
  return AGENT_META[key] ?? { ...DEFAULT_META, label: key.charAt(0).toUpperCase() + key.slice(1) };
}
