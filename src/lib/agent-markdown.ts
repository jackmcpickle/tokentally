export const INVITE_REQUIRED_MD = `# Invite required

Open \`/invite?invite=…\` in a browser first, then retry.
`;

export function isBrowserRequest(req: Request): boolean {
    const accept = req.headers.get('accept');
    if (accept && /text\/html/iu.test(accept)) return true;
    if (req.headers.get('sec-fetch-mode')) return true;
    return false;
}

function withAgentDiscovery(headers: Headers): void {
    headers.set('Link', '</llms.txt>; rel="describedby"');
    headers.set('X-Llms-Txt', '/llms.txt');
    headers.set('Vary', 'Accept, Sec-Fetch-Mode');
}

export function markdownBody(
    body: string,
    init?: { status?: number },
): Response {
    const headers = new Headers({
        'Content-Type': 'text/markdown; charset=utf-8',
    });
    withAgentDiscovery(headers);
    return new Response(body, { status: init?.status ?? 200, headers });
}

export function plainBody(body: string, init?: { status?: number }): Response {
    const headers = new Headers({
        'Content-Type': 'text/plain; charset=utf-8',
    });
    withAgentDiscovery(headers);
    return new Response(body, { status: init?.status ?? 200, headers });
}
