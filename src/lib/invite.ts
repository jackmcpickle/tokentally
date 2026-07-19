/**
 * Shared invite key gate. Comparison is constant-time via SHA-256 digests so
 * the key can't be recovered byte-by-byte from response timing. An unset key
 * disables the gate (local dev).
 */
export async function inviteAllowed(
    configuredKey: string | undefined,
    provided: unknown,
): Promise<boolean> {
    if (!configuredKey) return true;
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(configuredKey)),
        crypto.subtle.digest('SHA-256', enc.encode(provided)),
    ]);
    const av = new Uint8Array(a);
    const bv = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
    return diff === 0;
}
