const prisma = {
  shopSession: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
  productCost: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  orderProfit: {
    aggregate: jest.fn().mockResolvedValue({
      _sum: { revenueNet: null, feesTotal: null, shippingCost: null },
      _count: { _all: 0 },
    }),
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
  },
  order: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  lineItem: {
    deleteMany: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({}),
  },
  shopConfig: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  adConnection: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({ id: 1, shop: 'test-shop.myshopify.com', platform: 'meta' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  adSpend: {
    upsert: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $transaction: jest.fn(ops => Promise.all(ops)),
};
module.exports = { prisma };
