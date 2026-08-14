-- Fallback demo/test-only admin user, seeded ONLY when ADMIN_EMAIL /
-- ADMIN_PASSWORD are not set (see database/init/init.ts runSeed). Password is
-- "test_admin_password" — matches what tests/jest/src/auth/login.test.ts uses
-- to sign in; never used outside dev/test (runSeed refuses to run in
-- production, see database/init/init.ts).
INSERT INTO users (email, password_hash)
VALUES ('admin@propheta.test', '$2b$10$NAfV5qrBoiEvFWcxoo8UN.FtUtW/A0GGjTMJXUav/rz2kIrk2w0TS')
ON CONFLICT (email) DO NOTHING;