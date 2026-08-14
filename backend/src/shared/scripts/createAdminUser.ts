/**
 * One-off bootstrap: creates the single admin user from ADMIN_EMAIL /
 * ADMIN_PASSWORD. Run manually, never on every startup:
 *
 *   pnpm --prefix backend ts-node src/shared/scripts/createAdminUser.ts
 *
 * There is no self-registration endpoint — this script is the only way to
 * create a user.
 */
import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";

import { config } from "../../config";
import { createUser } from "../../repositories/postgres/auth.repository";
import { pool } from "../services/db";

async function main(): Promise<void> {
    const { adminEmail, adminPassword, saltRounds } = config.auth;

    if (!adminEmail || !adminPassword) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to create the admin user");
    }

    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    try {
        const user = await createUser({ email: adminEmail, passwordHash });
        console.log(`Admin user created: ${user.email} (${user.id})`);
    } catch (err) {
        if (err instanceof DatabaseError && err.code === "23505") {
            console.log(`Admin user already exists: ${adminEmail}`);
            return;
        }
        throw err;
    }
}

main()
    .catch((err: unknown) => {
        console.error("[FATAL] createAdminUser failed:", err);
        process.exitCode = 1;
    })
    .finally(() => {
        void pool.end();
    });
