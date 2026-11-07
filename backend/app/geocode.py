"""Place lookup via OpenStreetMap Nominatim, for commute estimates in the UI (README 4.6).

Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/): at most
1 request/s, an identifying User-Agent, and cache results. All three are enforced here: one global
lock spaces requests, and results (including misses) are cached in backend/.cache/geocode.json.

Lookups start while the coordinator is still merging (`warm`, called on each agent_result), so most
places are cached by the time the frontend asks for them.
"""

import json
import math
import re
import threading
import time
import urllib.parse
import urllib.request
from collections.abc import Iterable
from typing import Any

from common import BACKEND_DIR

URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = (
    "Wanderswarm/0.1 (hackathon POC; https://github.com/andrzej-zernaczuk/agentic_trip_planner)"
)
MIN_INTERVAL_S = 1.1  # policy: max 1 request per second
TIMEOUT_S = 8
OUTAGE_BACKOFF_S = 15  # after a network error or timeout, give the service a break
CITY_MARGIN_DEG = (
    0.4  # search area: ~40 km around the city (day trips, out-of-town stadiums)
)
NEAR_KM = 15  # a hit this close to the centre is taken at once; farther ones only as a last resort
CACHE_FILE = BACKEND_DIR / ".cache" / "geocode.json"

Coords = dict[str, float]  # {"lat": ..., "lng": ...}
PENDING = (
    "pending"  # not looked up because the service was unavailable; ask again later
)

_lock = threading.Lock()  # guards the rate limit, the cache and the outage flag
_last_request = 0.0
_down_until = 0.0
_cache: dict[str, Any] | None = None

# "Dinner at Cervejaria Ramiro" -> "Cervejaria Ramiro"
_MEAL_PREFIX = re.compile(
    r"^(breakfast|brunch|lunch|dinner|drinks|tapas|coffee)\s*(at|:|-)\s*", re.IGNORECASE
)


def _load_cache() -> dict[str, Any]:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(CACHE_FILE.read_text())
        except (OSError, ValueError):
            _cache = {}
    return _cache


def _save_cache() -> None:
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(_cache, ensure_ascii=False, indent=1))


def _search(query: str, viewbox: str | None, limit: int = 5) -> list[dict]:
    """One Nominatim request (caller holds _lock). Empty on no match or outage."""
    global _last_request, _down_until
    if time.monotonic() < _down_until:
        return []
    wait = _last_request + MIN_INTERVAL_S - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    params = {"q": query, "format": "jsonv2", "limit": str(limit)}
    if viewbox:
        params |= {"viewbox": viewbox, "bounded": "1"}
    req = urllib.request.Request(
        f"{URL}?{urllib.parse.urlencode(params)}", headers={"User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            hits = json.load(r)
    except (OSError, ValueError) as e:
        print(f"[geocode] Nominatim unavailable ({e}); pausing lookups", flush=True)
        _down_until = time.monotonic() + OUTAGE_BACKOFF_S
        return []
    finally:
        _last_request = time.monotonic()
    return hits if isinstance(hits, list) else []


def _unavailable() -> bool:
    return time.monotonic() < _down_until


def _km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def _city(destination: str) -> tuple[str, float, float] | None:
    """Search viewbox and centre of the destination (cached), so "Cathedral" means *this* city's."""
    cache = _load_cache()
    key = f"city|{destination.lower()}"
    if key not in cache:
        hits = _search(destination, None, limit=1)
        if not hits and _unavailable():
            return None  # don't cache a miss caused by an outage
        cache[key] = hits and {
            "box": [float(x) for x in hits[0]["boundingbox"]],  # [S, N, W, E]
            "lat": float(hits[0]["lat"]),
            "lng": float(hits[0]["lon"]),
        }
        _save_cache()
    city = cache[key]
    if not city:
        return None
    s, n, w, e = city["box"]
    m = CITY_MARGIN_DEG
    return f"{w - m},{n + m},{e + m},{s - m}", city["lat"], city["lng"]


# "Estadio de Mestalla" -> "Mestalla": OSM often names a place without the generic word.
_GENERIC_PREFIX = re.compile(
    r"^(estadio|estadi|est[áa]dio|stadium|stade|stadion|museo|museu|museum|mercado|mercat|market"
    r"|plaza|pla[çc]a|pra[çc]a|parque|park|palacio|pal[aá]cio|iglesia|igreja)\s+"
    r"((de|del|de la|de los|do|da|dos|das|of|the)\s+)?",
    re.IGNORECASE,
)


def _candidates(title: str, location: str | None) -> list[str]:
    """Most specific first: the venue name in the title, then the location, then its first part,
    then the same without a generic leading word (last resort)."""
    name = _MEAL_PREFIX.sub("", title).split(" (")[0].strip()
    out = [name]
    if " at " in name:  # "Sunset at Malvarrosa beach" -> "Malvarrosa beach"
        out.append(name.rsplit(" at ", 1)[1])
    if location:
        out.append(location)
        out.append(re.split(r"\s[–-]\s|/|\(|,", location)[0].strip())
    out += [_GENERIC_PREFIX.sub("", c) for c in out]
    return list(dict.fromkeys(c for c in out if len(c) > 2))


def place_key(destination: str, title: str, location: str | None) -> str:
    return f"{destination}|{title}|{location or ''}".lower()


def lookup(destination: str, title: str, location: str | None) -> Coords | str | None:
    """Coordinates for one activity, searched inside the destination's area. Cached, misses too.
    Returns PENDING instead of None when the miss may be due to an outage."""
    key = place_key(destination, title, location)
    with _lock:
        cache = _load_cache()
        if key in cache:
            return cache[key]
        city = _city(destination)
        viewbox = city[0] if city else None
        # Same-named places are common ("Santa Catalina"): take the hit nearest the centre, and
        # accept a far one only if no candidate finds anything close.
        result, best_km = None, math.inf
        for q in _candidates(title, location):
            for hit in _search(q, viewbox):
                lat, lng = float(hit["lat"]), float(hit["lon"])
                km = _km(lat, lng, city[1], city[2]) if city else 0.0
                if km < best_km:
                    result, best_km = {"lat": lat, "lng": lng}, km
            if best_km <= NEAR_KM:
                break
        if result is None and _unavailable():
            return PENDING  # don't cache a miss caused by an outage
        cache[key] = result
        _save_cache()
        return result


def lookup_many(
    destination: str, places: Iterable[tuple[str, str | None]]
) -> list[Coords | str | None]:
    return [lookup(destination, t, loc) for t, loc in places]


def warm(destination: str, items: list[dict]) -> None:
    """Look up a specialist's picks in the background, before the frontend asks for them."""
    places = [(i["title"], i.get("location")) for i in items if i.get("title")]
    threading.Thread(
        target=lookup_many, args=(destination, places), daemon=True
    ).start()
