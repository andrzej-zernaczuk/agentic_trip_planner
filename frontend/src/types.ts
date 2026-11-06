// Mirrors README section 4 (API) and section 5 (data model).

export type Interest = "sights" | "food" | "football";
export type Category = "sights" | "food" | "football" | "other";
export type PriceLevel = "€" | "€€" | "€€€";

export interface PlanRequest {
  destination: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  interests: Interest[];
  notes?: string;
}

export interface TripItem {
  time: string | null; // "HH:MM", null = flexible
  duration_min: number | null;
  title: string;
  description: string;
  category: Category;
  agent: string;
  location: string | null;
  price_level: PriceLevel | null;
  source_url: string | null;
}

export interface TripDay {
  date: string;
  title: string;
  items: TripItem[];
}

export interface TripPlan {
  plan_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary: string;
  agents_used: string[];
  days: TripDay[];
  highlights: Record<string, string[]>;
  warnings: string[];
}

export type SwarmEvent =
  | { type: "agent_started"; agent: string; message: string }
  | { type: "agent_finished"; agent: string; message: string }
  | { type: "log"; agent: string; message: string }
  | { type: "result"; plan: TripPlan }
  | { type: "error"; message: string };

export type AgentStatus = "idle" | "working" | "done" | "error";

export interface AgentState {
  status: AgentStatus;
  message: string;
}
