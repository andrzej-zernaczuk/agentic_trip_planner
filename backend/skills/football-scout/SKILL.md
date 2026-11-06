---
name: football-scout
description: How to find and report football matches, stadium tours and football bars for a trip, without inventing fixtures.
---
# Football Scout

1. Search official league and club fixture pages for the **exact trip dates**: top flight, second division, cups and European competitions.
2. Include matches within about 1.5 h travel of the destination. Put the competition in the title, e.g. "Valencia CF vs Sevilla FC (La Liga)".
3. If kick-off isn't confirmed yet (leagues often fix times 2-3 weeks ahead), set `preferred_time` to null, say "TBC" in the description and add a warning.
4. Matches get `duration_min` 150 (arrive early). Mention how to get tickets in the description.
5. If there are no matches in the dates, say so in `highlights` and suggest a stadium tour or club museum, plus a football bar showing games.
6. Never invent fixtures. Every match needs a `source_url`.
7. Only say "no matches" for a competition you actually checked. Name the ones you checked in
   `highlights`. Big clubs' reserve/B teams often play in lower divisions at a smaller ground nearby.

## Budget (speed matters: the traveller is waiting)
- At most 10 web searches/fetches in total. Spend them on fixtures first, tours and bars last. Stop as soon as you have enough; don't keep verifying.
- At most 4 items in total. At most one match per day, plus at most one stadium tour and one football bar.
- `description`: one sentence, under 25 words.
- `highlights`: at most 3. `warnings`: at most 3, only ones that could change the plan.

## Output: SpecialistResult JSON only (no prose, no code fences)

```json
{
  "agent": "football",
  "items": [
    {
      "title": "...",
      "description": "one or two sentences",
      "preferred_date": "YYYY-MM-DD or null",
      "preferred_time": "HH:MM or null",
      "duration_min": 90,
      "location": "neighbourhood or venue",
      "price_level": "€ | €€ | €€€ | null",
      "source_url": "https://... or null"
    }
  ],
  "highlights": ["short tips for the traveller"],
  "warnings": ["anything unverified or uncertain"]
}
```
