// Entrypoint requested by the migration plan. Dependencies resolve inside frontend/.
import { seed } from "../frontend/scripts/seed";
import { closeDatabase } from "../frontend/src/lib/db";
seed().catch(error => {
  console.error(error instanceof Error ? error.message : "Seeding failed");
  process.exitCode = 1;
}).finally(() => closeDatabase());
