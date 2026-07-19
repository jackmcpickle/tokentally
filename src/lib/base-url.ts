import type { Env } from '@/types';

export function baseUrl(env: Env, url: string): string {
    return env.PUBLIC_BASE_URL && env.PUBLIC_BASE_URL.length > 0
        ? env.PUBLIC_BASE_URL
        : new URL(url).origin;
}
