import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            '@oc-lock/crypto': fileURLToPath(new URL('./packages/crypto/src/index.ts', import.meta.url)),
            '@oc-lock/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
            '@oc-lock/device': fileURLToPath(new URL('./packages/device/src/index.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['packages/*/src/**/*.test.ts'],
        globals: false,
        passWithNoTests: false,
    },
});
