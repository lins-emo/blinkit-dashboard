import { MongoClient, Db, ObjectId } from "mongodb";

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

export async function listBlinkitRiders(): Promise<RiderDoc[]> {
  const d = await db();
  return d
    .collection<RiderDoc>("riders")
    .find(ridersFilter)
    .sort({ name: 1 })
    .toArray();
}

export async function getRider(id: string): Promise<RiderDoc | null> {
  const d = await db();
  if (!ObjectId.isValid(id)) return null;
  return d.collection<RiderDoc>("riders").findOne({ _id: new ObjectId(id) });
}
