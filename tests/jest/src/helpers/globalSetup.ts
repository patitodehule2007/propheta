/**
 * Runs once before the whole suite. Waits for the backend to be healthy and
 * reachable; test fixtures may be created here later.
 */
export default async function globalSetup(): Promise<void> {
    const backendUrl = process.env.BACKEND_URL ?? "http://backend-test:5000";

    for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await fetch(`${backendUrl}/health`);
        if (response.ok) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Backend at ${backendUrl} did not become healthy in time`);
}
