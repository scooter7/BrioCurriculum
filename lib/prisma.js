    // File: lib/prisma.js
    import { PrismaClient } from '@prisma/client';

    let prisma;

    // This is the recommended approach for Next.js with Prisma:
    // In development, a global variable is used to preserve the PrismaClient instance
    // across hot-reloads, preventing too many database connections.
    // In production, a new instance is created. In serverless functions,
    // this instance is typically reused across invocations if the function instance is warm.

    if (process.env.NODE_ENV === 'production') {
      console.log("[Prisma Client] Initializing for Production environment.");
      prisma = new PrismaClient();
    } else {
      if (!global.prisma) {
        console.log("[Prisma Client] Development: Creating new global PrismaClient instance.");
        global.prisma = new PrismaClient({
          // log: ['query', 'info', 'warn', 'error'], // Uncomment for local query logging
        });
      }
      prisma = global.prisma;
      // console.log("[Prisma Client] Development instance assigned."); // Can be noisy
    }

    export default prisma;
    