// File: lib/prisma.js
import { PrismaClient } from '@prisma/client';

let prisma;

// Check if we are in a production environment
if (process.env.NODE_ENV === 'production') {
  // In production, always create a new instance
  prisma = new PrismaClient();
} else {
  // In development, use a global variable to preserve the PrismaClient instance across hot-reloads.
  // This prevents creating too many connections to the database during development.
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      // Optional: log Prisma queries to the console during development
      // log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.prisma;
}

export default prisma;
