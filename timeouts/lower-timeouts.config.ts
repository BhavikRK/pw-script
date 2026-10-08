/**
 * Tight timeouts for the *-config-lower samples, to show a config's lower test timeout,
 * and its own action timeout, win over the CLI flags.
 * Named *.config.ts, not *.spec.ts, so Playwright never mistakes it for a test file.
 */
import {defineConfig} from "@playwright/test";

export default defineConfig({
    globalTimeout: 30_000,
    timeout: 1_500,
    use: {
        actionTimeout: 1_000,
    },
});
