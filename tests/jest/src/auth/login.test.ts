import { randomUUID } from "crypto";
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin } from "../helpers/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend-test:5000";

describe("Auth", () => {
    it("should set access and refresh cookies when credentials are valid", async () => {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });
        const body = (await response.json()) as { data: { user: { email: string } } };

        expect(response.status).toBe(200);
        expect(body.data.user.email).toBe(ADMIN_EMAIL);
        expect(response.headers.getSetCookie()).toHaveLength(2);
    });

    it("should return 401 when the password is wrong", async () => {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: `wrong-${randomUUID()}` })
        });

        expect(response.status).toBe(401);
    });

    it("should return 401 when the email is unknown", async () => {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: `unknown-${randomUUID()}@propheta.test`, password: "anything" })
        });

        expect(response.status).toBe(401);
    });

    it("should return 401 from a protected route when no session cookie is sent", async () => {
        const response = await fetch(`${BACKEND_URL}/api/accounts`);

        expect(response.status).toBe(401);
    });

    it("should return the current user from /api/auth/me when authenticated", async () => {
        const cookie = await loginAsAdmin();

        const response = await fetch(`${BACKEND_URL}/api/auth/me`, { headers: { Cookie: cookie } });
        const body = (await response.json()) as { data: { user: { email: string } } };

        expect(response.status).toBe(200);
        expect(body.data.user.email).toBe(ADMIN_EMAIL);
    });

    it("should clear the session on logout", async () => {
        const cookie = await loginAsAdmin();

        const logoutResponse = await fetch(`${BACKEND_URL}/api/auth/logout`, {
            method: "POST",
            headers: { Cookie: cookie }
        });
        expect(logoutResponse.status).toBe(200);

        const clearedCookies = logoutResponse.headers.getSetCookie();
        expect(clearedCookies).toHaveLength(2);
        expect(clearedCookies.every((setCookie) => setCookie.startsWith("propheta_") && /=;/.test(setCookie))).toBe(
            true
        );
    });
});
