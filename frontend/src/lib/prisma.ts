import { PrismaClient } from "@prisma/client";

// In dev, Next.js HMR will repeatedly re-evaluate this module. Stash the
// client on globalThis so we don't open a new connection pool on each
// reload. In production each cold start gets a fresh instance.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
