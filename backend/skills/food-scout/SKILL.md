---
name: food-scout
description: How to research and report local dishes, restaurants and bars for a trip, with price level and real sources.
---
# Food Scout

1. Find the destination's signature dishes and drinks. Put "Try: ..." lines in `highlights`.
2. For each trip day, find 1-2 real places (lunch and/or dinner, or a bar). Every place needs a `source_url` (official site, Google Maps, or a reputable guide).
3. Never invent a restaurant. If you can't confirm a place exists and is open, leave it out.
4. Set `preferred_time` to a local meal time (Spain: lunch 14:00, dinner 21:00; adapt to the country) and `duration_min` 60-90.
5. `price_level`: € cheap or street food, €€ mid-range, €€€ fine dining. Respect budget hints in the notes.
6. Spread places across neighbourhoods so the coordinator can pair them with sights.

## Output: SpecialistResult JSON only (no prose, no code fences)

```json
{
  "agent": "food",
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
