const { PrismaClient } = require('@prisma/client');

// Reuse single instance across hot-reloads in dev; create once in production
const prisma = globalThis.__prisma ?? new PrismaClient();
globalThis.__prisma = prisma;

module.exports = { prisma };
