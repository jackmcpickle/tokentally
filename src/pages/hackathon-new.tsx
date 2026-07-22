import type { FC } from 'hono/jsx';
import { familyLabel } from '@/lib/model-family';
import { Button } from '@/pages/components/button';
import { Input } from '@/pages/components/input';
import { Layout } from '@/pages/layout';
import { field, fieldLbl, hero, notice, sub } from '@/pages/ui';

interface HackathonNewProps {
    base: string;
    username: string;
    models: string[];
}

// datetime-local values are local wall-clock; new Date(v).getTime() yields UTC ms.
const SUBMIT_SCRIPT = `
(() => {
  const form = document.getElementById('hackathon-form');
  const err = document.getElementById('hackathon-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const fd = new FormData(form);
    const startAt = new Date(String(fd.get('start'))).getTime();
    const endAt = new Date(String(fd.get('end'))).getTime();
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      err.textContent = 'Enter valid start and end times.'; return;
    }
    const res = await fetch('/api/hackathons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        modelFamily: fd.get('modelFamily') || null,
        startAt, endAt,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.slug) { window.location.href = '/h/' + data.slug; return; }
    err.textContent = data.error || 'Could not create hackathon.';
  });
})();
`;

export const HackathonNew: FC<HackathonNewProps> = (p) => (
    <Layout
        title="New hackathon · tokenmaxer.quest"
        base={p.base}
    >
        <section class={hero}>
            <h1 class="wm">New hackathon</h1>
            <p class={sub}>
                Signed in as <strong class="text-text">@{p.username}</strong>.
                Set the window and share the join link. Times use your local
                timezone.
            </p>

            <form
                id="hackathon-form"
                class="max-w-[520px]"
            >
                <label
                    class={field}
                    htmlFor="hk-name"
                >
                    <span class={fieldLbl}>Name</span>
                    <Input
                        variant="text"
                        id="hk-name"
                        name="name"
                        required
                        placeholder="Spring Token Sprint"
                    />
                </label>
                <label
                    class={field}
                    htmlFor="hk-start"
                >
                    <span class={fieldLbl}>Starts</span>
                    <Input
                        variant="text"
                        id="hk-start"
                        type="datetime-local"
                        name="start"
                        required
                    />
                </label>
                <label
                    class={field}
                    htmlFor="hk-end"
                >
                    <span class={fieldLbl}>Ends</span>
                    <Input
                        variant="text"
                        id="hk-end"
                        type="datetime-local"
                        name="end"
                        required
                    />
                </label>
                <label
                    class={field}
                    htmlFor="hk-model"
                >
                    <span class={fieldLbl}>Restrict to model (optional)</span>
                    <Input
                        variant="select"
                        id="hk-model"
                        name="modelFamily"
                    >
                        <option value="">All models</option>
                        {p.models.map((m) => (
                            <option
                                key={m}
                                value={m}
                            >
                                {familyLabel(m)}
                            </option>
                        ))}
                    </Input>
                </label>

                <p
                    id="hackathon-error"
                    class="my-2 text-sm text-red-400"
                />
                <div class="mt-4">
                    <Button
                        variant="primary"
                        type="submit"
                    >
                        Create hackathon
                    </Button>
                </div>
            </form>
            <p class={notice}>
                You'll be added as the first member automatically.
            </p>
        </section>
        {/* eslint-disable-next-line */}
        <script dangerouslySetInnerHTML={{ __html: SUBMIT_SCRIPT }} />
    </Layout>
);
