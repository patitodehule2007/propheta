import { z } from "zod";

/**
 * Login request body. Single-admin auth — no registration fields.
 */
export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginSchema>;
