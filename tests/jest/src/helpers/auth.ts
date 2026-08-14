const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";

// Seeded by database/init/sql/seed/auth_admin.sql — demo/test-only, not a secret.
export const ADMIN_EMAIL = "admin@propheta.test";
export const ADMIN_PASSWORD = "test_admin_password";

/**
 * Logs in as the seeded admin and returns a `Cookie` header value carrying
 * both the access and refresh tokens, for use by tests that hit routes
 * behind `authMiddleware`.
 */
export async function loginAsAdmin(): Promise<string> {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });

    if (!response.ok) {
        throw new Error(`Admin login failed with status ${response.status}`);
    }

    return response.headers
        .getSetCookie()
        .map((setCookie) => setCookie.split(";")[0])
        .join("; ");
}
