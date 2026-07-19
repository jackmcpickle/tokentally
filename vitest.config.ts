import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@': new URL('./src', import.meta.url).pathname,
            // Workers entry; Node tests use the node build of the same API.
            '@cf-wasm/resvg/workerd': '@cf-wasm/resvg/node',
        },
    },
});
