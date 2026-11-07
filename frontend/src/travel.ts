// Commute estimates between two activities, from straight-line distance. Rough on purpose: good
// enough to tell "5 min walk" from "40 min across town", with no routing service involved.

export interface LatLng {
  lat: number;
  lng: number;
}

export type TravelMode = "walk" | "transit" | "unknown";

export interface Leg {
  minutes: number;
  mode: TravelMode;
  km: number | null;
}

const WALK_KMH = 4.8;
const TRANSIT_KMH = 18; // metro/bus/taxi average in a city, door to door
const TRANSIT_WAIT_MIN = 10; // getting to the stop, waiting
const DETOUR = 1.3; // streets aren't straight lines
const MAX_WALK_KM = 2;
const SAME_PLACE_KM = 0.15;
/** Used when either place couldn't be located. */
export const UNKNOWN_LEG: Leg = { minutes: 20, mode: "unknown", km: null };

const ceil5 = (m: number) => Math.max(5, Math.ceil(m / 5) * 5);

function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function leg(a: LatLng | null | undefined, b: LatLng | null | undefined): Leg {
  if (!a || !b) return UNKNOWN_LEG;
  const km = haversineKm(a, b);
  if (km <= SAME_PLACE_KM) return { minutes: 5, mode: "walk", km };
  if (km <= MAX_WALK_KM) return { minutes: ceil5(((km * DETOUR) / WALK_KMH) * 60), mode: "walk", km };
  return { minutes: ceil5(TRANSIT_WAIT_MIN + ((km * DETOUR) / TRANSIT_KMH) * 60), mode: "transit", km };
}

/** The key the frontend uses for a place in /api/geocode requests and the coordinates map. */
export function placeKey(item: { title: string; location?: string | null }): string {
  return `${item.title}|${item.location ?? ""}`;
}
