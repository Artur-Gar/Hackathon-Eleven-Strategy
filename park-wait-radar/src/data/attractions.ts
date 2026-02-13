export interface Attraction {
  id: string;
  name: string;
  area: string;
  areaColor: string;
  lat: number;
  lng: number;
}

export const ATTRACTIONS: Attraction[] = [
  { id: "giga-coaster", name: "Giga Coaster", area: "China", areaColor: "#dc3545", lat: 41.0884592, lng: 1.1619114 },
  { id: "roller-coaster", name: "Roller Coaster", area: "China", areaColor: "#dc3545", lat: 41.0884741, lng: 1.1608395 },
  { id: "flying-coaster", name: "Flying Coaster", area: "Mediterrània", areaColor: "#3388ff", lat: 41.0843941, lng: 1.156379 },
  { id: "kiddie-coaster", name: "Kiddie Coaster", area: "SésamoAventura", areaColor: "#6f42c1", lat: 41.0866994, lng: 1.1593646 },
  { id: "drop-tower", name: "Drop Tower", area: "México", areaColor: "#fd7e14", lat: 41.0899185, lng: 1.1590092 },
  { id: "rapids-ride", name: "Rapids Ride", area: "Far West", areaColor: "#d2b48c", lat: 41.0868132, lng: 1.1565065 },
  { id: "water-ride", name: "Water Ride", area: "Polynesia", areaColor: "#28a745", lat: 41.0846798, lng: 1.1580606 },
  { id: "bumper-cars", name: "Bumper Cars", area: "Far West", areaColor: "#d2b48c", lat: 41.087095, lng: 1.1570012 },
  { id: "merry-go-round", name: "Merry Go Round", area: "Far West", areaColor: "#d2b48c", lat: 41.0896774, lng: 1.155892 },
  { id: "spinning-coaster", name: "Spinning Coaster", area: "México", areaColor: "#fd7e14", lat: 41.0890787, lng: 1.1581803 },
  { id: "inverted-coaster", name: "Inverted Coaster", area: "Far West", areaColor: "#d2b48c", lat: 41.089695, lng: 1.1555904 },
  { id: "circus-train", name: "Circus Train", area: "SésamoAventura", areaColor: "#6f42c1", lat: 41.0862885, lng: 1.1592522 },
  { id: "haunted-house", name: "Haunted House", area: "SésamoAventura", areaColor: "#6f42c1", lat: 41.086363, lng: 1.1605387 },
  { id: "go-karts", name: "Go-Karts", area: "China", areaColor: "#dc3545", lat: 41.0881663, lng: 1.1584035 },
  { id: "swing-ride", name: "Swing Ride", area: "Far West", areaColor: "#d2b48c", lat: 41.0895807, lng: 1.157408 },
  { id: "vertical-drop", name: "Vertical Drop", area: "Far West", areaColor: "#d2b48c", lat: 41.0907598, lng: 1.1560799 },
  { id: "crazy-dance", name: "Crazy Dance", area: "México", areaColor: "#fd7e14", lat: 41.0900656, lng: 1.158703 },
  { id: "oz-theatre", name: "Oz Theatre", area: "México", areaColor: "#fd7e14", lat: 41.0904439, lng: 1.1597998 },
  { id: "superman-ride", name: "Superman Ride", area: "Far West", areaColor: "#d2b48c", lat: 41.0899839, lng: 1.1570706 },
  { id: "himalaya-ride", name: "Himalaya Ride", area: "Far West", areaColor: "#d2b48c", lat: 41.087343, lng: 1.1573234 },
  { id: "giant-wheel", name: "Giant Wheel", area: "China", areaColor: "#dc3545", lat: 41.0868121, lng: 1.162234 },
  { id: "spiral-slide", name: "Spiral Slide", area: "Far West", areaColor: "#d2b48c", lat: 41.0879321, lng: 1.1562076 },
  { id: "free-fall", name: "Free Fall", area: "SésamoAventura", areaColor: "#6f42c1", lat: 41.0865605, lng: 1.1592712 },
  { id: "dizzy-dropper", name: "Dizzy Dropper", area: "Far West", areaColor: "#d2b48c", lat: 41.0875486, lng: 1.1569792 },
  { id: "bungee-jump", name: "Bungee Jump", area: "Far West", areaColor: "#d2b48c", lat: 41.0902704, lng: 1.1567159 },
  { id: "zipline", name: "Zipline", area: "SésamoAventura", areaColor: "#6f42c1", lat: 41.0869735, lng: 1.1600437 },
];

// Park opens 10:00, closes 20:00 → 15-min slots
export const PARK_OPEN = 9; // 09:00
export const PARK_CLOSE = 23; // 23:00
export const SLOT_MINUTES = 15;
export const TOTAL_SLOTS = ((PARK_CLOSE - PARK_OPEN) * 60) / SLOT_MINUTES; // 40 slots

// Seeded pseudo-random for consistent data per attraction+day+slot
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Generate a realistic bell-curve-ish pattern for wait times through the day
export function getWaitTime(attractionId: string, dateStr: string, slotIndex: number): number {
  const seed = hashStr(attractionId + dateStr) + slotIndex * 7;
  const base = seededRandom(seed);

  // Bell curve peaking around slot 16-24 (14:00-16:00)
  const peakSlot = 16 + seededRandom(hashStr(attractionId)) * 8;
  const dist = Math.abs(slotIndex - peakSlot) / TOTAL_SLOTS;
  const curve = Math.exp(-dist * dist * 8);

  // Base popularity per attraction (popular rides get higher waits)
  const popularity = 0.4 + seededRandom(hashStr(attractionId + "pop")) * 0.6;

  const wait = Math.round(base * 15 + curve * popularity * 35);
  return Math.max(0, Math.min(50, wait));
}

export function slotToTime(slotIndex: number): string {
  const totalMinutes = PARK_OPEN * 60 + slotIndex * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function getWaitColor(minutes: number): string {
  if (minutes <= 10) return "#2ecc40";
  if (minutes <= 20) return "#f1c40f";
  if (minutes <= 30) return "#e74c3c";
  return "#8b1a1a";
}

export function getWaitLabel(minutes: number): string {
  if (minutes <= 10) return "Short wait";
  if (minutes <= 20) return "Moderate";
  if (minutes <= 30) return "Long wait";
  return "Very long";
}
