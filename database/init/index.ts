import { runInit, runSeed, runSeedIfEmpty } from "./init";

const command = process.argv[2];

async function main(): Promise<void> {
    if (command === "init") {
        await runInit();
    } else if (command === "seed") {
        await runSeed();
    } else if (command === "seed-if-empty") {
        await runSeedIfEmpty();
    } else {
        console.error(`Unknown command: "${command}". Use: init | seed | seed-if-empty`);
        process.exit(1);
    }
}

main().catch((err: unknown) => {
    console.error("\n[FATAL] DB command failed:", err);
    process.exit(1);
});
