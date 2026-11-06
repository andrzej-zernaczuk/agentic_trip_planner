import { useState, type FormEvent } from "react";
import type { Interest, PlanRequest } from "../types";
import { AGENT_META } from "../agents";

const INTERESTS: Interest[] = ["sights", "food", "football"];

interface Props {
  disabled: boolean;
  onSubmit: (req: PlanRequest) => void;
}

export function TripForm({ disabled, onSubmit }: Props) {
  const [destination, setDestination] = useState("Valencia, Spain");
  const [startDate, setStartDate] = useState("2026-11-20");
  const [endDate, setEndDate] = useState("2026-11-22");
  const [interests, setInterests] = useState<Interest[]>(INTERESTS);
  const [notes, setNotes] = useState("");

  const toggle = (i: Interest) =>
    setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  const invalid = !destination.trim() || !startDate || !endDate || endDate < startDate || interests.length === 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    onSubmit({
      destination: destination.trim(),
      start_date: startDate,
      end_date: endDate,
      interests,
      ...(notes.trim() && { notes: notes.trim() }),
    });
  };

  return (
    <form className="trip-form" onSubmit={submit}>
      <label className="field wide">
        <span>Destination</span>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, Country" />
      </label>
      <label className="field">
        <span>From</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="field">
        <span>To</span>
        <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <fieldset className="field wide interests">
        <span>Specialists</span>
        <div>
          {INTERESTS.map((i) => (
            <label key={i} className={`chip ${interests.includes(i) ? "on" : ""}`} style={{ ["--c" as string]: AGENT_META[i].color }}>
              <input type="checkbox" checked={interests.includes(i)} onChange={() => toggle(i)} />
              {AGENT_META[i].icon} {AGENT_META[i].label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field wide">
        <span>Notes</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Budget-friendly, we like walking" />
      </label>
      <button type="submit" disabled={disabled || invalid}>
        {disabled ? "Swarm working…" : "Plan my trip"}
      </button>
    </form>
  );
}
