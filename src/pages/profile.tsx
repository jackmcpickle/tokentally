import type { FC } from 'hono/jsx';
import type { Profile } from '@/lib/aggregate';
import { countryName, flagEmoji } from '@/lib/countries';
import { formatDate, formatTokens, formatUsd } from '@/lib/format';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import {
    empty,
    hero,
    num,
    panel,
    pill,
    stat,
    statGrid,
    statK,
    statV,
} from '@/pages/ui';

const SOURCE_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    opencode: 'opencode',
    pi: 'pi',
    cursor: 'Cursor',
};

const SHARE_SCRIPT = `
(function () {
  var root = document.getElementById('share-card');
  if (!root) return;
  var profileUrl = root.getAttribute('data-profile-url') || '';
  var imageUrl = root.getAttribute('data-image-url') || '';
  var username = root.getAttribute('data-username') || '';
  var filename = username + '-tokenmaxer.png';
  var copyBtn = root.querySelector('[data-share="copy"]');
  var downloadBtn = root.querySelector('[data-share="download"]');
  var shareBtn = root.querySelector('[data-share="native"]');

  function fetchPng() {
    return fetch(imageUrl).then(function (res) { return res.blob(); });
  }

  function promptCopy() {
    window.prompt('Copy profile link', profileUrl);
  }

  if (shareBtn && typeof navigator.share === 'function') {
    shareBtn.hidden = false;
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var label = copyBtn.textContent;
      function done() {
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = label; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(profileUrl).then(done).catch(promptCopy);
      } else {
        promptCopy();
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function (event) {
      event.preventDefault();
      fetchPng()
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        })
        .catch(function () {
          window.location.href = imageUrl;
        });
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var shareData = {
        title: username + ' on tokenmaxer.quest',
        text: 'Check my token tally on tokenmaxer.quest',
        url: profileUrl,
      };
      fetchPng()
        .then(function (blob) {
          var file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share(Object.assign({}, shareData, { files: [file] }));
          }
          return navigator.share(shareData);
        })
        .catch(function () {
          if (navigator.share) return navigator.share(shareData);
        });
    });
  }
})();
`;

export const ProfilePage: FC<{ base: string; profile: Profile }> = ({
    base,
    profile: p,
}) => {
    const origin = base.replace(/\/$/u, '');
    const profileUrl = `${origin}/u/${p.username}`;
    const ogImage = `${origin}/u/${p.username}/og.png`;
    const description = `${p.username} is rank #${p.rank} on tokenmaxer.quest with ${formatTokens(p.grand_total)} tokens tracked.`;

    return (
        <Layout
            title={`${p.username} · tokenmaxer.quest`}
            base={base}
            description={description}
            ogImage={ogImage}
            ogUrl={profileUrl}
            ogImageAlt={`${p.username} token tally on tokenmaxer.quest`}
        >
            <section class={hero}>
                <h1 class="reveal">{p.username}</h1>
                <p class="reveal reveal-delay mb-0 max-w-[52ch] text-[18px] leading-snug tracking-[-0.18px] text-muted">
                    {flagEmoji(p.country)} {countryName(p.country)} · Rank #
                    {p.rank} · joined {formatDate(p.created_at)} · {p.sessions}{' '}
                    sessions tracked
                </p>
                {p.url ? (
                    <p class="reveal reveal-delay mt-3 mb-0 text-[16px]">
                        <a
                            class="text-accent"
                            href={p.url}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            {p.url}
                        </a>
                    </p>
                ) : null}
            </section>

            <section
                id="share-card"
                class="reveal mb-10"
                data-profile-url={profileUrl}
                data-image-url={ogImage}
                data-username={p.username}
            >
                <h2 class="mt-0 mb-4 text-[22px] font-bold tracking-[-0.8px]">
                    Share
                </h2>
                <div class="flex flex-wrap gap-3">
                    <Button
                        variant="secondary"
                        data-share="copy"
                    >
                        Copy link
                    </Button>
                    <Button
                        variant="secondary"
                        href={ogImage}
                        download={`${p.username}-tokenmaxer.png`}
                        data-share="download"
                    >
                        Download
                    </Button>
                    <Button
                        variant="primary"
                        data-share="native"
                        hidden
                    >
                        Share…
                    </Button>
                </div>
            </section>

            <div class={`${statGrid} mb-10`}>
                <div class={stat}>
                    <div class={statK}>Total tokens</div>
                    <div class={statV}>{formatTokens(p.grand_total)}</div>
                </div>
                <div class={stat}>
                    <div class={statK}>Input + output</div>
                    <div class={statV}>
                        {formatTokens(p.input_tokens + p.output_tokens)}
                    </div>
                </div>
                <div class={stat}>
                    <div class={statK}>Output</div>
                    <div class={statV}>{formatTokens(p.output_tokens)}</div>
                </div>
                <div class={stat}>
                    <div class={statK}>Cache read</div>
                    <div class={statV}>{formatTokens(p.cache_read_tokens)}</div>
                </div>
                <div class={stat}>
                    <div class={statK}>Cache write</div>
                    <div class={statV}>
                        {formatTokens(p.cache_creation_tokens)}
                    </div>
                </div>
                <div class={stat}>
                    <div class={statK}>Est. cost</div>
                    <div class={statV}>{formatUsd(p.cost)}</div>
                </div>
            </div>

            <h2 class="mt-0">By model</h2>
            <div class="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
                <div class={`${panel} min-w-0`}>
                    {p.breakdown.length === 0 ? (
                        <div class={empty}>No usage reported yet.</div>
                    ) : (
                        <div class="overflow-x-auto">
                            <table class="min-w-xl">
                                <thead>
                                    <tr>
                                        <th>Source</th>
                                        <th>Model</th>
                                        <th class={num}>Total</th>
                                        <th class={num}>Output</th>
                                        <th class={num}>Est. cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {p.breakdown.map((b) => (
                                        <tr key={`${b.source}:${b.model}`}>
                                            <td>
                                                <span class={pill}>
                                                    {SOURCE_LABELS[b.source] ??
                                                        b.source}
                                                </span>
                                            </td>
                                            <td>
                                                <code>{b.model}</code>
                                            </td>
                                            <td class={num}>
                                                {formatTokens(
                                                    b.input_tokens +
                                                        b.output_tokens +
                                                        b.cache_read_tokens +
                                                        b.cache_creation_tokens +
                                                        b.reasoning_tokens,
                                                )}
                                            </td>
                                            <td class={num}>
                                                {formatTokens(b.output_tokens)}
                                            </td>
                                            <td class={num}>
                                                {formatUsd(b.cost)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <aside class="spotlight spotlight-violet w-full md:h-fit">
                    <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                        Keep climbing
                    </p>
                    <p class="mb-6 text-[20px] leading-snug tracking-[-0.01px] sm:text-[22px]">
                        Back to the board, or claim another machine with the
                        same hooks.
                    </p>
                    <Button
                        variant="primary"
                        href="/"
                    >
                        View leaderboard
                    </Button>
                </aside>
            </div>
            {/* eslint-disable-next-line */}
            <script dangerouslySetInnerHTML={{ __html: SHARE_SCRIPT }} />
        </Layout>
    );
};
