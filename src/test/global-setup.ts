import { execSync } from "node:child_process";

/** Fresh SQLite test database for every run. Fake data only. */
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
