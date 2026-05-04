import { MongoClient, Db, ObjectId } from "mongodb";
import { unstable_cache } from "next/cache";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "test";

if (!uri) throw new Error("MONGODB_URI not set");

declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __mongoConnect: Promise<MongoClient> | undefined;
}

function client(): Promise<MongoClient> {
  if (global.__mongoConnect) return global.__mongoConnect;
  const c = new MongoClient(uri!, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });
  global.__mongoClient = c;
  global.__mongoConnect = c.connect();
  return global.__mongoConnect;
}

export async function db(): Promise<Db> {
  const c = await client();
  return c.db(dbName);
}

export interface RiderDoc {
  _id: ObjectId;
  name?: string;
  phone?: string;
  email?: string;
  zone?: string;
  city?: string;
  landmark?: string;
  isBlinkitRider?: boolean;
  isActive?: boolean;
  freezeStatus?: boolean;
  bmsUnresponsive?: boolean;
  vehicleStatus?: "MOBILIZED" | "IMMOBILIZED" | string;
  vehicleAssigned?: {
    vehicleId?: string;
    vehicleName?: string;
    chasisNo?: string;
    operatorName?: string;
  };
  vehicleAssignedAt?: Date;
  intellicarToken?: string;
  kyc?: {
    aadharUrl?: string;
    licenseUrl?: string;
    pancardUrl?: string;
    selfieUrl?: string;
  };
  plan_selected?: { plan?: string; amount?: string | number; activeDays?: number; depositAmount?: number };
  lateDate?: { averageDelayDays?: number; history?: Array<{ rentDueDate: Date; rentPaidDate: Date; gapDays: number }> };
  topUp?: Array<{ topUpAmount: number; topUpAmountDate: Date; source?: string }>;
  rentDueDate?: Date;
  totalAmount?: number;
  depositAmountPaid?: number;
  appId?: string;
  userName?: string;
  createdAt?: Date;
  updatedAt?: Date;
  location?: { type: "Point"; coordinates: [number, number] };
  mobilizeAttempts?: { count: number; date: string };
}

export const ridersFilter = { isBlinkitRider: true } as const;

async function _listBlinkitRiders(): Promise<RiderDoc[]> {
  const d = await db();
  return d.collection<RiderDoc>("riders").find(ridersFilter).sort({ name: 1 }).toArray();
}

// Rider docs change slowly (new onboardings, status flips) — cache 60s.
export const listBlinkitRiders = unstable_cache(
  _listBlinkitRiders,
  ["mongo:blinkitRiders:v1"],
  { revalidate: 60, tags: ["riders", "mongo"] }
);

export async function getRider(id: string): Promise<RiderDoc | null> {
  const d = await db();
  if (!ObjectId.isValid(id)) return null;
  return d.collection<RiderDoc>("riders").findOne({ _id: new ObjectId(id) });
}

// ---------- distance_floor: cross-lambda monotonic high-water marks ----------
// We never display a distance lower than the highest value previously observed
// for the same (vehicle, window) within a 1-hour TTL. Stored in Mongo so all
// Vercel serverless instances share the same floor.

interface FloorDoc { _id: string; value: number; updatedAt: Date }

let floorIndexEnsured = false;
async function ensureFloorIndex(): Promise<void> {
  if (floorIndexEnsured) return;
  try {
    const d = await db();
    await d.collection("distance_floor").createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: 3600, name: "ttl_1h" }
    );
    floorIndexEnsured = true;
  } catch {
    // best-effort; if index already exists, that's fine
    floorIndexEnsured = true;
  }
}

export async function readFloors(keys: string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  await ensureFloorIndex();
  const d = await db();
  const cursor = d.collection<FloorDoc>("distance_floor").find({ _id: { $in: keys } });
  const out = new Map<string, number>();
  for await (const doc of cursor) out.set(doc._id, doc.value);
  return out;
}

export async function writeFloor(key: string, value: number): Promise<void> {
  await ensureFloorIndex();
  const d = await db();
  // $max ensures the value never goes down even under concurrent writes from
  // different lambda instances. updatedAt always refreshes so TTL slides forward.
  await d.collection("distance_floor").updateOne(
    { _id: key } as never,
    { $max: { value }, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function writeFloors(entries: Array<{ key: string; value: number }>): Promise<void> {
  if (entries.length === 0) return;
  await ensureFloorIndex();
  const d = await db();
  const ops = entries.map((e) => ({
    updateOne: {
      filter: { _id: e.key } as never,
      update: { $max: { value: e.value }, $set: { updatedAt: new Date() } },
      upsert: true,
    },
  }));
  await d.collection("distance_floor").bulkWrite(ops, { ordered: false });
}
