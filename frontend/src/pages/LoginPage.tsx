import type { FormEvent, JSX } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";

import { extractErrorMessage } from "../shared/apiError";
import { useAuthStore } from "../store/authStore";

const credentialsSchema = z.object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(1, "Password is required")
});

/**
 * Single-admin login. No sign-up flow exists — the admin user is
 * bootstrapped server-side (see docs/backend/auth.md).
 */
export function LoginPage(): JSX.Element {
    const login = useAuthStore((state) => state.login);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setFormError(null);

        const result = credentialsSchema.safeParse({ email, password });
        if (!result.success) {
            setFieldError(result.error.issues[0]?.message ?? "Invalid input");
            return;
        }
        setFieldError(null);

        setIsSubmitting(true);
        try {
            await login(result.data.email, result.data.password);
            navigate("/", { replace: true });
        } catch (err) {
            setFormError(extractErrorMessage(err, "Invalid email or password"));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="login-page">
            <form className="card login-card" onSubmit={(event) => void handleSubmit(event)}>
                <h1 className="card-title">Propheta</h1>

                <div className="form-field">
                    <label className="form-label" htmlFor="email">
                        Email
                    </label>
                    <input
                        id="email"
                        className="form-input"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>

                <div className="form-field">
                    <label className="form-label" htmlFor="password">
                        Password
                    </label>
                    <input
                        id="password"
                        className="form-input"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />
                </div>

                {fieldError !== null && <p className="form-error">{fieldError}</p>}
                {formError !== null && <p className="form-error">{formError}</p>}

                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </div>
    );
}
