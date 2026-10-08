/**
 * Timeouts for pwtest-config-override.spec.ts: the config's own action timeout wins over --actionTimeout,
 * and a lower --testTimeout would win over the config's timeout.
 * Named *.config.ts, not *.spec.ts, so Playwright never mistakes it for a test file.
 */
import {defineConfig} from "@playwright/test";

export default defineConfig({
    globalTimeout: 3_600_000,
    timeout: 15_000,
    use: {
        actionTimeout: 10_000,
        navigationTimeout: 30_000,
    },
});
