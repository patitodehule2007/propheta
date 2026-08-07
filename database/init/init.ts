import path from "path";
import fs from "fs";
import { Client, ClientConfig } from "pg";
import { knex as createKnex } from "knex";

const ROOT_DIR = __filename.endsWith(".js") ? path.join(__dirname, "..") : __dirname;
const SQL_DIR = path.join(ROOT_DIR, "sql");

const APP_SCHEMA = "propheta";
const FN_SCHEMA = "propheta_fn";
const APP_ROLE = "app_user";

/**
 * Aborts when running against a production database.
 *
 * The demo seed is a development convenience and may destroy data.
 *
 * @param operation Human-readable name of the refused operation.
 * @throws {Error} When NODE_ENV is "production".
 */
function assertNotProduction(operation: string): void {
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            `${operation} is a development-only operation and destroys existing data. ` +
                `Refusing to run with NODE_ENV=production.`
        );
    }
}

function adminConnection() {
    return {
        host: process.env.DB_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        port: Number(process.env.DB_PORT) || 5432
    };
}

async function connect(): Promise<Client> {
    const client = new Client(adminConnection() as ClientConfig);
    await client.connect();
    return client;
}

async function execFile(client: Client, filePath: string): Promise<void> {
    const sql = fs.readFileSync(filePath, "utf-8");
    await client.query(sql);
    console.log(`  ✓ ${path.relative(SQL_DIR, filePath)}`);
}

function findSqlFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findSqlFiles(full));
        else if (entry.name.endsWith(".sql")) results.push(full);
    }
    return results.sort();
}

async function step1_createSchemaAndRole(client: Client): Promise<void> {
    console.log("\n[1/5] Schema + role...");

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA}`);

    await client.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
                CREATE ROLE ${APP_ROLE} WITH
                    NOSUPERUSER NOCREATEDB NOCREATEROLE
                    INHERIT LOGIN NOREPLICATION NOBYPASSRLS
                    CONNECTION LIMIT 50;
            END IF;
        END $$
    `);

    const pwd = (process.env.DB_PASSWORD ?? "").replace(/'/g, "''");
    await client.query(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${pwd}'`);
    await client.query(`ALTER ROLE ${APP_ROLE} CONNECTION LIMIT 50`);
    await client.query(`GRANT USAGE ON SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);

    await client.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");

    console.log(`  ✓ Schema ${APP_SCHEMA}`);
    console.log(`  ✓ Role ${APP_ROLE}`);
    console.log("  ✓ Extension pg_stat_statements");
}

async function step2_runMigrations(): Promise<void> {
    console.log("\n[2/5] Running migrations...");

    const knex = createKnex({
        client: "pg",
        connection: adminConnection(),
        searchPath: [APP_SCHEMA, "public"],
        migrations: {
            directory: path.join(ROOT_DIR, "migrations"),
            tableName: "knex_migrations",
            schemaName: "public",
            loadExtensions: [__filename.endsWith(".js") ? ".js" : ".ts"]
        }
    });

    try {
        await knex.migrate.forceFreeMigrationsLock();
        const [, filenames] = await knex.migrate.latest();
        if (filenames.length === 0) {
            console.log("  ✓ Already up to date");
        } else {
            for (const f of filenames) console.log(`  ✓ ${path.basename(f)}`);
        }
    } finally {
        await knex.destroy();
    }
}

async function step3_loadDbObjects(client: Client): Promise<void> {
    console.log("\n[3/5] Loading DB objects...");
    await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
    await client.query(`DROP SCHEMA IF EXISTS ${FN_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${FN_SCHEMA}`);

    await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
    for (const f of findSqlFiles(path.join(SQL_DIR, "functions"))) await execFile(client, f);

    await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
    for (const f of findSqlFiles(path.join(SQL_DIR, "procedures"))) await execFile(client, f);

    await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
    for (const f of findSqlFiles(path.join(SQL_DIR, "triggers"))) await execFile(client, f);
}

async function step4_grantPrivileges(client: Client): Promise<void> {
    console.log("\n[4/5] Granting privileges...");
    await client.query(`GRANT USAGE ON SCHEMA ${FN_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA ${FN_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL PROCEDURES IN SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`GRANT ALL ON ALL ROUTINES IN SCHEMA ${APP_SCHEMA} TO ${APP_ROLE}`);
    await client.query(`
        ALTER DEFAULT PRIVILEGES IN SCHEMA ${APP_SCHEMA}
        GRANT ALL ON TABLES TO ${APP_ROLE}
    `);
    await client.query(`
        ALTER DEFAULT PRIVILEGES IN SCHEMA ${APP_SCHEMA}
        GRANT ALL ON SEQUENCES TO ${APP_ROLE}
    `);
    console.log("  ✓ Grants applied");
}

async function step5_applySecurity(client: Client): Promise<void> {
    console.log("\n[5/5] Applying security SQL...");
    await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
    for (const f of findSqlFiles(path.join(SQL_DIR, "security"))) await execFile(client, f);
}

/**
 * Provisions a fresh database: schema, application role, knex migrations,
 * executable SQL objects, grants, and security policies.
 */
export async function runInit(): Promise<void> {
    console.log("=== PROPHETA DB INITIALIZATION ===");

    const client = await connect();
    try {
        await step1_createSchemaAndRole(client);
        await step2_runMigrations();
        await step3_loadDbObjects(client);
        await step4_grantPrivileges(client);
        await step5_applySecurity(client);
    } finally {
        await client.end();
    }

    console.log("\n=== INITIALIZATION COMPLETE ===\n");
}

/**
 * Loads the demo dataset by executing every SQL file under sql/seed/.
 * Development and test environments only.
 *
 * @throws {Error} When NODE_ENV is "production".
 */
export async function runSeed(): Promise<void> {
    console.log("=== PROPHETA DB SEED ===");
    assertNotProduction("Demo data seed");

    const client = await connect();
    try {
        await client.query(`SET search_path TO ${FN_SCHEMA}, ${APP_SCHEMA}, public`);
        for (const f of findSqlFiles(path.join(SQL_DIR, "seed"))) await execFile(client, f);
    } finally {
        await client.end();
    }

    console.log("\n=== SEED COMPLETE ===\n");
}

/**
 * Runs {@link runSeed} only when no application table has rows yet.
 *
 * Development convenience for a freshly created database.
 *
 * @returns True when the seed ran, false when existing data caused it to be skipped.
 * @throws {Error} When NODE_ENV is "production".
 */
export async function runSeedIfEmpty(): Promise<boolean> {
    assertNotProduction("Conditional demo data seed");

    const client = await connect();
    try {
        const tables = await client.query<{ table_name: string }>(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
            [APP_SCHEMA]
        );

        for (const row of tables.rows) {
            const result = await client.query(
                `SELECT EXISTS (SELECT 1 FROM "${APP_SCHEMA}"."${row.table_name}" LIMIT 1) AS has_rows`
            );
            if (result.rows[0]?.has_rows === true) {
                console.log("=== DB already has data — seed skipped ===\n");
                return false;
            }
        }
    } finally {
        await client.end();
    }

    await runSeed();
    return true;
}
