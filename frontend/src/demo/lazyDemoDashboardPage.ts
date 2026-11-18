import { lazy } from "react";

/**
 * The simulated dashboard, or null unless the app was built with `VITE_ENABLE_DEMO=true`.
 *
 * The flag comparison must stay in this module, next to the dynamic import: the bundler
 * only drops the demo chunk from production builds when it can resolve the condition here.
 */
export const LazyDemoDashboardPage =
    import.meta.env.VITE_ENABLE_DEMO === "true"
        ? lazy(async () => {
              const module = await import("./DemoDashboardPage");
              return { default: module.DemoDashboardPage };
          })
        : null;
