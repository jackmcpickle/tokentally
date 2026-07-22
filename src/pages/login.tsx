import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import { hero, notice, sub } from '@/pages/ui';

interface LoginProps {
    base: string;
    /** Where to send the user back to after login, if any. */
    next?: string;
}

export const Login: FC<LoginProps> = (p) => (
    <Layout
        title="Log in · tokenmaxer.quest"
        base={p.base}
    >
        <section class={hero}>
            <h1 class="wm">Log in from your terminal</h1>
            <p class={sub}>
                Hackathons are managed from the browser. Log in by running this
                in your terminal — it uses your existing reporter token to open
                a one-time login link.
            </p>
            <pre class="my-4 overflow-x-auto rounded-lg bg-panel2 px-4 py-3.5 text-sm text-text">
                npx tokenmaxer login
            </pre>
            <p class={notice}>
                No token yet? <a href="/start">Claim a username</a> and install
                the reporter first.
            </p>
            {p.next ? (
                <div class="mt-6">
                    <Button
                        variant="secondary"
                        href={p.next}
                    >
                        ← Back
                    </Button>
                </div>
            ) : null}
        </section>
    </Layout>
);
