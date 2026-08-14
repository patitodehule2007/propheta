import { query } from "../../shared/services/db";

export interface User {
    id: string;
    email: string;
    passwordHash: string;
    createdAt: string;
}

export interface CreatedUser {
    id: string;
    email: string;
    createdAt: string;
}

/**
 * Looks up a user by email for login. Returns null when no user matches.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
    const rows = await query<{ id: string; email: string; password_hash: string; created_at: string }>(
        "SELECT * FROM get_user_by_email($1)",
        [email]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

/**
 * Inserts a new user. Only called by the admin bootstrap script — there is
 * no self-registration endpoint. A duplicate email raises a unique
 * violation (pg error code 23505) that the caller must handle.
 */
export async function createUser(params: { email: string; passwordHash: string }): Promise<CreatedUser> {
    const rows = await query<{ id: string; email: string; created_at: string }>("SELECT * FROM create_user($1, $2)", [
        params.email,
        params.passwordHash
    ]);
    const row = rows[0];
    if (!row) throw new Error("create_user returned no row");
    return { id: row.id, email: row.email, createdAt: row.created_at };
}
