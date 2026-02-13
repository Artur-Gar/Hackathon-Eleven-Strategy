import { Attraction } from "@/data/attractions";

/** Haversine distance in meters between two lat/lng points */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Walking time in minutes assuming 5 km/h */
export function walkingMinutes(meters: number): number {
  return meters / (5000 / 60); // 83.33 m/min
}

/**
 * Find optimal visiting order minimising total cost = walking time + wait time.
 * Uses nearest-neighbour heuristic (good enough for ≤30 attractions).
 * Returns ordered list of attraction IDs + per-step stats.
 */
export interface RouteStep {
  attractionId: string;
  walkingDistance: number; // meters from previous
  walkingTime: number;    // minutes
  waitTime: number;       // average wait minutes
}

export function optimizeRoute(
  attractions: Attraction[],
  getAvgWait: (id: string) => number
): RouteStep[] {
  if (attractions.length === 0) return [];
  if (attractions.length === 1) {
    return [{
      attractionId: attractions[0].id,
      walkingDistance: 0,
      walkingTime: 0,
      waitTime: getAvgWait(attractions[0].id),
    }];
  }

  const remaining = [...attractions];
  const steps: RouteStep[] = [];

  // Start with the attraction that has the lowest avg wait (beat the crowds)
  remaining.sort((a, b) => getAvgWait(a.id) - getAvgWait(b.id));
  const first = remaining.shift()!;
  steps.push({
    attractionId: first.id,
    walkingDistance: 0,
    walkingTime: 0,
    waitTime: getAvgWait(first.id),
  });

  // Greedy nearest-neighbour weighted by distance + wait
  while (remaining.length > 0) {
    const prev = attractions.find((a) => a.id === steps[steps.length - 1].attractionId)!;
    let bestIdx = 0;
    let bestCost = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const dist = haversineDistance(prev.lat, prev.lng, candidate.lat, candidate.lng);
      const walk = walkingMinutes(dist);
      const wait = getAvgWait(candidate.id);
      // Cost: walking time + wait time (both in minutes)
      const cost = walk + wait;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    const dist = haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
    steps.push({
      attractionId: next.id,
      walkingDistance: Math.round(dist),
      walkingTime: Math.round(walkingMinutes(dist)),
      waitTime: getAvgWait(next.id),
    });
  }

  return steps;
}
