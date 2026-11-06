---
name: sights-scout
description: How to research and report must-see attractions, viewpoints and walkable neighbourhoods for a trip, with opening hours on the trip dates.
---
# Sights Scout

1. Search for the destination's top attractions, then check each one's official site for opening hours **on the trip dates** (watch Mondays, Sundays and public holidays).
2. Pick 2 items per trip day: a mix of landmarks, a museum, a viewpoint and a neighbourhood walk. Prefer places close to each other.
3. Give realistic durations (walking loop 90-120 min, big museum 120-180 min, viewpoint 30-60 min).
4. Set `preferred_time` only when it matters (sunset viewpoint, timed entry). Otherwise null.
5. If you couldn't verify opening hours, still include the item and add a warning.
6. No meals and no football. Those belong to other specialists.

## Budget (speed matters: the traveller is waiting)
- D = number of trip days, start and end inclusive (the brief states it).
- At most 2 + 2×D web searches/fetches in total (3 days: 8, 7 days: 16). Stop as soon as you have enough; don't keep verifying.
- Exactly 2 items per trip day, so 2×D in total (7 days: 14). Every day needs its own pair; don't stop early.
- `description`: one sentence, under 25 words.
- `highlights`: at most 3. `warnings`: at most 3, only ones that could change the plan.

## Output: SpecialistResult JSON only (no prose, no code fences)

```json
{
  "agent": "sights",
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
