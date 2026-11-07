import type { Category, SpecialistItem, SpecialistResult, TripItem } from "../types";
import { agentMeta } from "../agents";
import { formatDate } from "../format";
import { Item, ShortList } from "./Itinerary";

const CATEGORIES: Category[] = ["sights", "food", "football"];

function toTripItem(item: SpecialistItem, agent: string): TripItem {
  return {
    time: item.preferred_time ?? null,
    duration_min: item.duration_min ?? null,
    title: item.title,
    description: item.description ?? "",
    category: (CATEGORIES as string[]).includes(agent) ? (agent as Category) : "other",
    agent,
    location: item.location ?? null,
    price_level: item.price_level ?? null,
    source_url: item.source_url ?? null,
  };
}

interface Props {
  result: SpecialistResult;
  /** False until the merged plan exists: there's nothing to add to yet. */
  canAdd: boolean;
  /** "agent:index" -> day label, for picks already added to the plan. */
  added: Record<string, string>;
  onAdd: (index: number, item: TripItem, date: string | null | undefined) => void;
}

/** One specialist's raw picks, grouped by the day it suggested. Shown before the plan is merged. */
export function AgentPicks({ result, canAdd, added, onAdd }: Props) {
  const meta = agentMeta(result.agent);
  // Keep each pick's index in result.items: it identifies the pick for "added" tracking.
  const groups = new Map<string, [number, SpecialistItem][]>();
  result.items.forEach((item, i) => {
    const key = item.preferred_date ?? "";
    groups.set(key, [...(groups.get(key) ?? []), [i, item]]);
  });
  // Dated groups in order, "any day" last.
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  return (
    <div className="itin-grid">
      <div>
        <p className="picks-note">
          {meta.icon} The {meta.label.toLowerCase()} agent's picks, as it suggested them. The coordinator may move or drop
          some when it builds the plan; {canAdd ? "use “Add to plan” to bring one back." : "you can add them back once the plan is ready."}
        </p>
        {result.items.length === 0 && <p className="empty">This agent found nothing for these dates.</p>}
        {keys.map((k) => (
          <section key={k || "any"} className="pick-group">
            <h4>{k ? formatDate(k) : "Any day"}</h4>
            <ol className="items">
              {groups.get(k)!.map(([i, it]) => {
                const done = added[`${result.agent}:${i}`];
                return (
                  <Item
                    key={i}
                    item={toTripItem(it, result.agent)}
                    footer={
                      canAdd && (
                        <div className="edit-row">
                          {done ? (
                            <span className="added">✓ Added to {done}</span>
                          ) : (
                            <button onClick={() => onAdd(i, toTripItem(it, result.agent), it.preferred_date)}>
                              + Add to plan
                            </button>
                          )}
                        </div>
                      )
                    }
                  />
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <aside className="side">
        {result.highlights.length > 0 && (
          <div className="panel">
            <h3>Highlights</h3>
            <ShortList lines={result.highlights} limit={3} />
          </div>
        )}
        {result.warnings.length > 0 && (
          <div className="panel warn">
            <h3>⚠️ Warnings</h3>
            <ShortList lines={result.warnings} limit={4} />
          </div>
        )}
      </aside>
    </div>
  );
}
