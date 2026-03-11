const prisma = {
  shopSession: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
};
module.exports = { prisma };
