import { describe, expect, it } from 'vitest';
import {
    INVITE_REQUIRED_MD,
    isBrowserRequest,
    markdownBody,
    plainBody,
} from '@/lib/agent-markdown';

function req(headers: Record<string, string>): Request {
    return new Request('https://tokenmaxer.quest/', { headers });
}

describe('isBrowserRequest', () => {
    it('is true when Accept includes text/html', () => {
        expect(
            isBrowserRequest(
                req({
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }),
            ),
        ).toBe(true);
    });

    it('is true when Sec-Fetch-Mode is present', () => {
        expect(
            isBrowserRequest(
                req({ Accept: '*/*', 'Sec-Fetch-Mode': 'navigate' }),
            ),
        ).toBe(true);
    });

    it('is false for curl-like Accept */* without Sec-Fetch', () => {
        expect(
            isBrowserRequest(
                req({ Accept: '*/*', 'User-Agent': 'curl/8.7.1' }),
            ),
        ).toBe(false);
    });

    it('is false when Accept is missing', () => {
        expect(isBrowserRequest(req({}))).toBe(false);
    });

    it('is false for Accept: text/markdown', () => {
        expect(isBrowserRequest(req({ Accept: 'text/markdown' }))).toBe(false);
    });
});

describe('markdownBody / plainBody', () => {
    it('sets markdown content-type, Vary, and discovery headers', async () => {
        const res = markdownBody('# Hi\n');
        expect(res.headers.get('Content-Type')).toBe(
            'text/markdown; charset=utf-8',
        );
        expect(res.headers.get('Vary')).toBe('Accept, Sec-Fetch-Mode');
        expect(res.headers.get('Link')).toContain('/llms.txt');
        expect(res.headers.get('X-Llms-Txt')).toBe('/llms.txt');
        expect(await res.text()).toBe('# Hi\n');
    });

    it('sets text/plain for plainBody', () => {
        const res = plainBody('# llms\n');
        expect(res.headers.get('Content-Type')).toBe(
            'text/plain; charset=utf-8',
        );
    });

    it('honors status', () => {
        expect(markdownBody(INVITE_REQUIRED_MD, { status: 403 }).status).toBe(
            403,
        );
    });
});
