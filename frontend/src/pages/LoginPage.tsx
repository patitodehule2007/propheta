import type { FormEvent, JSX } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Button, ButtonSize, ButtonVariant } from "../components/ui";
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

    const hasFieldError = fieldError !== null;

    return (
        <main className="login-page">
            <div className="login-panel">
                <div>
                    <h1 className="login-brand">Propheta</h1>
                    <div className="tape-rule" aria-hidden="true" />
                </div>

                <form className="login-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
                    <div className="form-field">
                        <label className="form-label" htmlFor="email">
                            Email
                        </label>
                        <div className="input-shell ui-field" data-invalid={hasFieldError || undefined}>
                            <input
                                id="email"
                                className="form-input"
                                type="email"
                                autoComplete="username"
                                value={email}
                                aria-invalid={hasFieldError}
                                aria-describedby={hasFieldError ? "login-field-error" : undefined}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="password">
                            Password
                        </label>
                        <div className="input-shell ui-field" data-invalid={hasFieldError || undefined}>
                            <input
                                id="password"
                                className="form-input"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                aria-invalid={hasFieldError}
                                aria-describedby={hasFieldError ? "login-field-error" : undefined}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {hasFieldError && (
                        <p id="login-field-error" className="form-error">
                            {fieldError}
                        </p>
                    )}
                    {formError !== null && (
                        <p className="form-error" role="alert">
                            {formError}
                        </p>
                    )}

                    <Button
                        type="submit"
                        variant={ButtonVariant.PRIMARY}
                        size={ButtonSize.LG}
                        isPending={isSubmitting}
                        pendingLabel="Signing in"
                    >
                        Sign in
                    </Button>
                </form>
            </div>
        </main>
    );
}
