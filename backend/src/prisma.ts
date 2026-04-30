import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const prismaClient =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaClient;

// Export as `any` so snake_case model names (agents, visits, float_issues, etc.)
// compile without TS errors — Prisma generates camelCase but DB schema uses snake_case aliases
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = prismaClient as any;
