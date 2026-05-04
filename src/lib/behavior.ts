import type { GpsHistoryPoint } from "./intellicar";

export interface Trip {
  startTime: number;
  endTime: number;
  startLoc: [number, number];
  endLoc: [number, number];
  distanceKm: number;
  maxSpeed: number;
  avgMovingSpeed: number;
  durationMin: number;
  idleMin: number;
  pointCount: number;
}

export interface BehaviorSummary {
  totalDistanceKm: number;
  activeMin: number;
  idleMin: number;
  movingMin: number;
  maxSpeed: number;
  avgMovingSpeed: number;
  tripCount: number;
  harshAccelCount: number;
  harshBrakeCount: number;
  batteryDipCount: number;
  minBattery: number | null;
  trips: Trip[];
}

const IGN_ON = (p: GpsHistoryPoint) => {
  const v = p.ignstatus;
  return v === 1 || v === "1" || (typeof v === "string" && v.toLowerCase() === "on");
};

// km/h delta thresholds over ~2s sample
const HARSH_ACCEL_KMH_PER_S = 7;   // > 7 km/h gain in <2s
const HARSH_BRAKE_KMH_PER_S = 9;   // > 9 km/h loss in <2s
const TRIP_GAP_MS = 5 * 60 * 1000; // gap > 5 min splits trips
const MOVING_SPEED = 5;            // km/h
const BATTERY_DIP_THRESHOLD = 20;  // %

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function summarize(rawPoints: GpsHistoryPoint[]): BehaviorSummary {
  const points = (rawPoints || [])
    .filter((p) => p && typeof p.latitude === "number" && typeof p.longitude === "number")
    .sort((a, b) => (a.commtime ?? 0) - (b.commtime ?? 0));

  const empty: BehaviorSummary = {
    totalDistanceKm: 0, activeMin: 0, idleMin: 0, movingMin: 0,
    maxSpeed: 0, avgMovingSpeed: 0, tripCount: 0,
    harshAccelCount: 0, harshBrakeCount: 0, batteryDipCount: 0,
    minBattery: null, trips: [],
  };
  if (points.length === 0) return empty;

  // Split into trips by ignition state and time gaps
  const tripsRaw: GpsHistoryPoint[][] = [];
  let current: GpsHistoryPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (!prev) {
      if (IGN_ON(p)) current.push(p);
      continue;
    }
    const gap = (p.commtime ?? 0) - (prev.commtime ?? 0);
    if (!IGN_ON(p) || gap > TRIP_GAP_MS) {
      if (current.length > 1) tripsRaw.push(current);
      current = [];
      if (IGN_ON(p)) current.push(p);
    } else {
      current.push(p);
    }
  }
  if (current.length > 1) tripsRaw.push(current);

  let totalDistanceKm = 0;
  let activeMs = 0;
  let movingMs = 0;
  let idleMs = 0;
  let maxSpeed = 0;
  let movingSpeedSum = 0;
  let movingSpeedCount = 0;
  let harshAccelCount = 0;
  let harshBrakeCount = 0;
  let batteryDipCount = 0;
  let minBattery: number | null = null;
  let belowDip = false;

  const trips: Trip[] = [];

  for (const tp of tripsRaw) {
    let tDist = 0;
    let tMoving = 0;
    let tIdle = 0;
    let tMax = 0;
    let tMovingSum = 0;
    let tMovingCount = 0;
    for (let i = 1; i < tp.length; i++) {
      const a = tp[i - 1];
      const b = tp[i];
      const dt = ((b.commtime ?? 0) - (a.commtime ?? 0)) / 1000; // s
      if (dt <= 0 || dt > 120) continue;
      const km = haversineKm([a.latitude, a.longitude], [b.latitude, b.longitude]);
      tDist += km;
      const sp = b.speed ?? 0;
      if (sp > tMax) tMax = sp;
      if (sp > maxSpeed) maxSpeed = sp;
      if (sp >= MOVING_SPEED) {
        tMoving += dt;
        tMovingSum += sp;
        tMovingCount += 1;
      } else {
        tIdle += dt;
      }

      // harsh accel/brake from speed delta
      const dv = (b.speed ?? 0) - (a.speed ?? 0);
      const dvPerSec = dv / dt;
      if (dvPerSec >= HARSH_ACCEL_KMH_PER_S) harshAccelCount += 1;
      if (-dvPerSec >= HARSH_BRAKE_KMH_PER_S) harshBrakeCount += 1;

      // battery dips
      const bat = b.carbattery ?? b.vehbattery ?? null;
      if (bat != null) {
        if (minBattery == null || bat < minBattery) minBattery = bat;
        if (!belowDip && bat <= BATTERY_DIP_THRESHOLD) {
          batteryDipCount += 1;
          belowDip = true;
        } else if (belowDip && bat > BATTERY_DIP_THRESHOLD + 5) {
          belowDip = false;
        }
      }
    }
    totalDistanceKm += tDist;
    activeMs += tMoving * 1000 + tIdle * 1000;
    movingMs += tMoving * 1000;
    idleMs += tIdle * 1000;
    movingSpeedSum += tMovingSum;
    movingSpeedCount += tMovingCount;
    const start = tp[0];
    const end = tp[tp.length - 1];
    trips.push({
      startTime: start.commtime,
      endTime: end.commtime,
      startLoc: [start.latitude, start.longitude],
      endLoc: [end.latitude, end.longitude],
      distanceKm: round(tDist, 2),
      maxSpeed: round(tMax, 1),
      avgMovingSpeed: tMovingCount ? round(tMovingSum / tMovingCount, 1) : 0,
      durationMin: round((tMoving + tIdle) / 60, 1),
      idleMin: round(tIdle / 60, 1),
      pointCount: tp.length,
    });
  }

  return {
    totalDistanceKm: round(totalDistanceKm, 2),
    activeMin: round(activeMs / 60000, 1),
    movingMin: round(movingMs / 60000, 1),
    idleMin: round(idleMs / 60000, 1),
    maxSpeed: round(maxSpeed, 1),
    avgMovingSpeed: movingSpeedCount ? round(movingSpeedSum / movingSpeedCount, 1) : 0,
    tripCount: trips.length,
    harshAccelCount,
    harshBrakeCount,
    batteryDipCount,
    minBattery: minBattery != null ? round(minBattery, 1) : null,
    trips,
  };
}

function round(n: number, d: number): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
