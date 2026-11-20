/**
 * Deterministic fake data: 1,000 customers and 5,000 card transactions over
 * the last 90 days. Same seed, same rows, so screenshots are repeatable.
 * Dates are offsets from SEED_ANCHOR_DATE (default: today, UTC midnight).
 * Never use real customer data here.
 */
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

export const CUSTOMER_COUNT = 1_000;
export const TRANSACTION_COUNT = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MERCHANTS: Array<[string, string]> = [
  ["Bluebird Coffee", "Food & drink"],
  ["Northwind Grocers", "Groceries"],
  ["Metro Transit", "Transport"],
  ["Skyline Air", "Travel"],
  ["Harbor Hotels", "Travel"],
  ["Pixel Electronics", "Electronics"],
  ["Evergreen Pharmacy", "Health"],
  ["Cinema Nova", "Entertainment"],
  ["Fjord Streaming", "Subscriptions"],
  ["Atlas Fuel", "Fuel"],
  ["Lumen Utilities", "Utilities"],
  ["Copperleaf Books", "Shopping"],
];

function anchorDate(): Date {
  const raw = process.env.SEED_ANCHOR_DATE;
  const d = raw ? new Date(raw) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function buildSeedData(anchor = anchorDate()) {
  faker.seed(20261119);
  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: `cus_${String(i + 1).padStart(5, "0")}`,
      name: `${firstName} ${lastName}`,
      email: faker.internet
        .email({ firstName, lastName, provider: "example.com" })
        .toLowerCase(),
      phone: `+1-555-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
      country: faker.helpers.weightedArrayElement([
        { weight: 70, value: "US" },
        { weight: 10, value: "CA" },
        { weight: 10, value: "GB" },
        { weight: 10, value: "DE" },
      ]),
      status: faker.helpers.weightedArrayElement([
        { weight: 92, value: "active" },
        { weight: 5, value: "restricted" },
        { weight: 3, value: "closed" },
      ]),
      riskTier: faker.helpers.weightedArrayElement([
        { weight: 75, value: "low" },
        { weight: 20, value: "medium" },
        { weight: 5, value: "high" },
      ]),
      createdAt: new Date(anchor.getTime() - faker.number.int({ min: 91, max: 900 }) * DAY_MS),
    };
  });

  const transactions = Array.from({ length: TRANSACTION_COUNT }, (_, i) => {
    const [merchant, category] = faker.helpers.arrayElement(MERCHANTS);
    const status = faker.helpers.weightedArrayElement([
      { weight: 85, value: "settled" },
      { weight: 8, value: "pending" },
      { weight: 4, value: "declined" },
      { weight: 3, value: "refunded" },
    ]);
    const amountCents = faker.number.int({ min: 199, max: 250_000 });
    return {
      id: `txn_${String(i + 1).padStart(6, "0")}`,
      customerId: faker.helpers.arrayElement(customers).id,
      amountCents,
      refundedCents: status === "refunded" ? amountCents : 0,
      currency: "USD",
      merchant,
      category,
      cardLast4: faker.string.numeric(4),
      status,
      createdAt: new Date(anchor.getTime() - faker.number.int({ min: 0, max: 90 * DAY_MS - 1 })),
    };
  });

  return { customers, transactions };
}

async function main() {
  const prisma = new PrismaClient();
  const { customers, transactions } = buildSeedData();
  await prisma.$transaction(async (tx) => {
    await tx.cardTransaction.deleteMany();
    await tx.customer.deleteMany();
    for (let i = 0; i < customers.length; i += 500) {
      await tx.customer.createMany({ data: customers.slice(i, i + 500) });
    }
    for (let i = 0; i < transactions.length; i += 500) {
      await tx.cardTransaction.createMany({ data: transactions.slice(i, i + 500) });
    }
  }, { timeout: 60_000 });
  console.log(`Seeded ${customers.length} customers and ${transactions.length} transactions.`);
  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
