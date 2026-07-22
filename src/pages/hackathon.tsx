import type { FC } from 'hono/jsx';
import type { LeaderboardEntry } from '@/lib/aggregate';
import type { HackathonRow, HackathonState, MemberRow } from '@/lib/hackathon';
import { familyLabel } from '@/lib/model-family';
import { Button } from '@/pages/components/button';
import { HackathonBoard } from '@/pages/hackathon-board';
import { Layout } from '@/pages/layout';
import type { Metric } from '@/types';

const STATE_LABELS: Record<HackathonState, string> = {
    upcoming: 'Upcoming',
    live: 'Live',
    ended: 'Ended',
};

/** host = can manage; member = joined; guest = logged-in non-member; anon = logged out. */
export type ViewerRole = 'host' | 'member' | 'guest' | 'anon';

interface HackathonPageProps {
    base: string;
    hackathon: HackathonRow;
    state: HackathonState;
    metric: Metric;
    entries: LeaderboardEntry[];
    members: MemberRow[];
    role: ViewerRole;
    models: string[];
}

// Renders <time data-utc> values as the viewer's local time, and wires host/join
// actions. All content is static or server-escaped; no untrusted interpolation.
const PAGE_SCRIPT = `
(() => {
  document.querySelectorAll('time[data-utc]').forEach((el) => {
    const ms = Number(el.getAttribute('data-utc'));
    if (Number.isFinite(ms)) el.textContent = new Date(ms).toLocaleString();
  });
  // Prefill datetime-local inputs with local wall-clock from UTC ms.
  document.querySelectorAll('input[data-utc-fill]').forEach((el) => {
    const ms = Number(el.getAttribute('data-utc-fill'));
    if (!Number.isFinite(ms)) return;
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    el.value = d.toISOString().slice(0, 16);
  });
  async function send(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }
  document.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const r = await send('POST', btn.getAttribute('data-join'));
      if (r.ok) location.reload(); else alert(r.data.error || 'Failed to join');
    });
  });
  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this member?')) return;
      const r = await send('DELETE', btn.getAttribute('data-remove'));
      if (r.ok) location.reload(); else alert(r.data.error || 'Failed');
    });
  });
  const del = document.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this hackathon? This cannot be undone.')) return;
    const r = await send('DELETE', del.getAttribute('data-delete'));
    if (r.ok) location.href = '/h/mine'; else alert(r.data.error || 'Failed');
  });
  const copy = document.querySelector('[data-copy]');
  if (copy) copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(copy.getAttribute('data-copy'));
    copy.textContent = 'Copied!';
    setTimeout(() => { copy.textContent = 'Copy join link'; }, 1500);
  });
  const editForm = document.getElementById('edit-form');
  if (editForm) editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(editForm);
    const r = await send('PATCH', editForm.getAttribute('action'), {
      name: fd.get('name'),
      modelFamily: fd.get('modelFamily') || null,
      startAt: new Date(String(fd.get('start'))).getTime(),
      endAt: new Date(String(fd.get('end'))).getTime(),
    });
    if (r.ok) location.reload();
    else document.getElementById('edit-error').textContent = r.data.error || 'Failed';
  });
})();
`;

export const HackathonPage: FC<HackathonPageProps> = (p) => {
    const h = p.hackathon;
    const joinUrl = `${p.base.replace(/\/$/u, '')}/h/${h.slug}/join`;
    return (
        <Layout
            title={`${h.name} · hackathon · tokenmaxer.quest`}
            base={p.base}
        >
            <section class="mb-6 pt-6">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="wm text-3xl">{h.name}</h1>
                    <span class="rounded-md bg-panel2 px-2.5 py-1 text-xs font-semibold text-text">
                        {STATE_LABELS[p.state]}
                    </span>
                </div>
                <p class="mt-2 text-sm text-muted">
                    <time data-utc={String(h.start_at)}>
                        {new Date(h.start_at).toISOString()}
                    </time>{' '}
                    →{' '}
                    <time data-utc={String(h.end_at)}>
                        {new Date(h.end_at).toISOString()}
                    </time>
                    {h.model_family
                        ? ` · ${familyLabel(h.model_family)} only`
                        : ' · all models'}
                </p>
            </section>

            {p.state === 'upcoming' ? (
                <div class="mb-6 rounded-lg border border-border bg-panel px-5 py-8 text-center text-muted">
                    This hackathon hasn't started yet. Come back when it's live.
                </div>
            ) : (
                <HackathonBoard
                    slug={h.slug}
                    metric={p.metric}
                    entries={p.entries}
                />
            )}

            {p.role === 'guest' ? (
                <Button
                    variant="primary"
                    data-join={`/api/hackathons/${h.slug}/join`}
                >
                    Join this hackathon
                </Button>
            ) : null}
            {p.role === 'anon' ? (
                <Button
                    variant="primary"
                    href={`/login?next=/h/${h.slug}`}
                >
                    Log in to join
                </Button>
            ) : null}

            {p.role === 'host' ? (
                <section class="mt-4 rounded-lg border border-border bg-panel p-5">
                    <h2 class="mb-3 text-lg font-extrabold">Host controls</h2>
                    <Button
                        variant="secondary"
                        data-copy={joinUrl}
                    >
                        Copy join link
                    </Button>

                    <h3 class="mt-6 mb-2 text-sm font-semibold text-muted">
                        Members ({p.members.length})
                    </h3>
                    <div class="flex flex-col gap-1">
                        {p.members.map((m) => (
                            <div
                                key={m.user_id}
                                class="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-panel2"
                            >
                                <span class="text-sm text-text">
                                    @{m.username}
                                    {m.user_id === h.host_user_id
                                        ? ' (host)'
                                        : ''}
                                </span>
                                {m.user_id === h.host_user_id ? null : (
                                    <Button
                                        variant="ghost"
                                        class="!min-h-0 px-2 py-1 text-xs text-red-400"
                                        data-remove={`/api/hackathons/${h.slug}/members/${m.username}`}
                                    >
                                        Remove
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>

                    <h3 class="mt-6 mb-2 text-sm font-semibold text-muted">
                        Edit
                    </h3>
                    <form
                        id="edit-form"
                        action={`/api/hackathons/${h.slug}`}
                        class="max-w-[520px]"
                    >
                        <input
                            class="ui-input mb-2 w-full rounded-md border border-border bg-panel2 px-3.5 py-2.5 text-[15px] text-text"
                            name="name"
                            value={h.name}
                        />
                        <select
                            class="ui-input mb-2 w-full rounded-md border border-border bg-panel2 px-3.5 py-2.5 text-[15px] text-text"
                            name="modelFamily"
                        >
                            <option
                                value=""
                                selected={!h.model_family}
                            >
                                All models
                            </option>
                            {p.models.map((m) => (
                                <option
                                    key={m}
                                    value={m}
                                    selected={m === h.model_family}
                                >
                                    {familyLabel(m)}
                                </option>
                            ))}
                        </select>
                        <input
                            class="ui-input mb-2 w-full rounded-md border border-border bg-panel2 px-3.5 py-2.5 text-[15px] text-text"
                            type="datetime-local"
                            name="start"
                            data-utc-fill={String(h.start_at)}
                        />
                        <input
                            class="ui-input mb-2 w-full rounded-md border border-border bg-panel2 px-3.5 py-2.5 text-[15px] text-text"
                            type="datetime-local"
                            name="end"
                            data-utc-fill={String(h.end_at)}
                        />
                        <p
                            id="edit-error"
                            class="my-2 text-sm text-red-400"
                        />
                        <div class="flex gap-2">
                            <Button
                                variant="primary"
                                type="submit"
                            >
                                Save changes
                            </Button>
                            <Button
                                variant="ghost"
                                class="text-red-400"
                                data-delete={`/api/hackathons/${h.slug}`}
                            >
                                Delete
                            </Button>
                        </div>
                    </form>
                </section>
            ) : null}

            {/* eslint-disable-next-line */}
            <script dangerouslySetInnerHTML={{ __html: PAGE_SCRIPT }} />
        </Layout>
    );
};
