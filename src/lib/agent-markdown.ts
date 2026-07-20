export const INVITE_REQUIRED_MD = `# Invite required

Open \`/invite?token=…\` in a browser first, then retry.
`;

/** Headers that select HTML vs Markdown for agent-discoverable pages. */
export const AGENT_PAGE_VARY_HEADERS = ['Accept', 'Sec-Fetch-Mode'] as const;

export const AGENT_PAGE_VARY = AGENT_PAGE_VARY_HEADERS.join(', ');

// Link-preview crawlers need HTML (OG tags); they Accept like curl (*/*).
const LINK_PREVIEW_BOT_RE =
    /Slackbot|Twitterbot|facebookexternalhit|Facebot|Discordbot|LinkedInBot|WhatsApp|TelegramBot|SkypeUriPreview|Iframely|Embedly|redditbot|Pinterest/iu;

export function isLinkPreviewBot(ua: string): boolean {
    return LINK_PREVIEW_BOT_RE.test(ua);
}

export function isBrowserRequest(req: Request): boolean {
    if (isLinkPreviewBot(req.headers.get('user-agent') ?? '')) return true;
    const accept = req.headers.get('accept') ?? '';
    if (/text\/html/iu.test(accept)) return true;
    return Boolean(req.headers.get('sec-fetch-mode'));
}

function withAgentDiscovery(headers: Headers): void {
    headers.set('Link', '</llms.txt>; rel="describedby"');
    headers.set('X-Llms-Txt', '/llms.txt');
    headers.set('Vary', AGENT_PAGE_VARY);
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
