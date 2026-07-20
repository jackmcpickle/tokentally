# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 0.2.3 (2026-07-20)

### Bug Fixes

- **ci:** publish reporter via npm trusted publishing (OIDC), drop NPM_TOKEN ([#17](https://github.com/jackmcpickle/tokenmaxer/issues/17))
- **reporter:** normalize bin path so npm publish keeps the CLI ([#17](https://github.com/jackmcpickle/tokenmaxer/issues/17))

## 0.2.2 (2026-07-20)

### Features

- add about and start Markdown content modules ([74653f8](https://github.com/jackmcpickle/tokentally/commit/74653f85a66a1ec09302fcb2c6820018d32a6321))
- add agent Markdown negotiation helpers ([2e649be](https://github.com/jackmcpickle/tokentally/commit/2e649be60d58b4844eae51be7e0cb6da3d17ef21))
- add agent Markdown page routes ([2ff2f54](https://github.com/jackmcpickle/tokentally/commit/2ff2f548d62a79e0257a25b3e1303be291554cca))
- add cursor source ([211a8e6](https://github.com/jackmcpickle/tokentally/commit/211a8e60b361af3ce9ef49615690d8e3c6e59345))
- add footprint leaderboard for energy, water, and CO₂e ([0a56a44](https://github.com/jackmcpickle/tokentally/commit/0a56a448709ace063100a293441f6ab5e282c198))
- add llms.txt and llms-full.txt content builders ([2201d59](https://github.com/jackmcpickle/tokentally/commit/2201d59d921978bcb2e49c2572ffe9e018285d7d))
- add opencode and pi token reporting support ([97ef55e](https://github.com/jackmcpickle/tokentally/commit/97ef55e9541ba694825dccc36b4d957c74aaf548))
- bundle leaderboard model filter by family ([479fd79](https://github.com/jackmcpickle/tokentally/commit/479fd7985389eb652caaf5aea84cd8245df93a11))
- cache dashboard and profile reads for 10 minutes ([#11](https://github.com/jackmcpickle/tokentally/issues/11)) ([3953ba1](https://github.com/jackmcpickle/tokentally/commit/3953ba11edb9c59d972847aba6d12e002532f70f))
- CLI help command + invalidate profile cache on set-profile-url ([92f0ba7](https://github.com/jackmcpickle/tokentally/commit/92f0ba717da81794791c8c1df2eb7bcad6017e61))
- cursor-sync reporter command ([55710f6](https://github.com/jackmcpickle/tokentally/commit/55710f64f3fd341c383ad0be8cb5da92bb1be4d7))
- dynamic profile share cards for social media ([#12](https://github.com/jackmcpickle/tokentally/issues/12)) ([346478c](https://github.com/jackmcpickle/tokentally/commit/346478c825045e6c79649e665b4b8fc136196341))
- gate invites with a session cookie via /invite ([fd11509](https://github.com/jackmcpickle/tokentally/commit/fd11509068e17317488d5f3726efbc3621e65778))
- invite-gate username registration ([30119c1](https://github.com/jackmcpickle/tokentally/commit/30119c166ae46c47c18ad3d0018bf3ab37242fdf))
- lock Capsule Ladder brand with favicons and OG images ([a299b4c](https://github.com/jackmcpickle/tokentally/commit/a299b4cae760fc4301fb725417fcb1a665617b7b))
- negotiate Markdown for non-browser page requests ([750129b](https://github.com/jackmcpickle/tokentally/commit/750129bad4c647788613da64d94530b490db8491))
- optional profile URL at invite-gated username claim ([a289186](https://github.com/jackmcpickle/tokentally/commit/a2891867473909c70a4efcd638cd32d1a71611fe))
- optional public profile URL via API and CLI ([#10](https://github.com/jackmcpickle/tokentally/issues/10)) ([39d3832](https://github.com/jackmcpickle/tokentally/commit/39d383243242b11f3ce61247e7c6d665a3e35dca))
- protect username claim with Cloudflare Turnstile ([a296d4d](https://github.com/jackmcpickle/tokentally/commit/a296d4d90b17fb983046d06e19c87aee108434bd))
- publish reporter as tokenmaxer npm pkg, add --dry-run + privacy docs ([4529e10](https://github.com/jackmcpickle/tokentally/commit/4529e109d013e045c2e73088519686cef2567d67))
- redesign UI as tokenmaxer.quest dark marketing surface ([0535c2c](https://github.com/jackmcpickle/tokentally/commit/0535c2c68776b2115afb67a59ba773f5fb4cf544))
- render leaderboard and profile as Markdown tables ([89a59fb](https://github.com/jackmcpickle/tokentally/commit/89a59fb60c8d3659e0fb20c32c1350047271dd4c))
- replace leaderboard table with ranked horizontal chart ([1810b33](https://github.com/jackmcpickle/tokentally/commit/1810b331f9f6eb169b62fd09279e7bd631e05b29))
- reporter parses cursor usage events ([81d5e57](https://github.com/jackmcpickle/tokentally/commit/81d5e57e91850fd9634adc1f2d2600b845842abd))
- restyle spotlight cards with aurora mesh gradients ([0f66cec](https://github.com/jackmcpickle/tokentally/commit/0f66cec0c3cd813f6fa177e59c773bbb20888497))
- switch aurora spotlights to indigo-peach mesh ([0e1b725](https://github.com/jackmcpickle/tokentally/commit/0e1b725aaab8210fe8c6bab8e6b885383bcaa734))
- tabbed start page with agent prompt, cursor tab, invite gate ([0212161](https://github.com/jackmcpickle/tokentally/commit/02121611132376eb8231bf086d49e4cbdde9866c))

### Bug Fixes

- accept /invite?token= for session cookie unlock ([97eaae2](https://github.com/jackmcpickle/tokentally/commit/97eaae2003f4d9af17e97a5fa044ed2e8517dd99))
- add unicode flag to agent Markdown regexes ([dccb7a4](https://github.com/jackmcpickle/tokentally/commit/dccb7a4f6e8131d2b872b8087bc32e51ca4dd73f))
- build CSS before Workers Builds deploy ([4889d33](https://github.com/jackmcpickle/tokentally/commit/4889d335224be76f0fa6a118aa33dc902708dd85))
- check script uses fmt:check ([#13](https://github.com/jackmcpickle/tokentally/issues/13)) ([e5805a1](https://github.com/jackmcpickle/tokentally/commit/e5805a1e6683f1d46e9a858e39602c0a53a39aa0))
- clear oxlint errors blocking CI ([fbe7d2a](https://github.com/jackmcpickle/tokentally/commit/fbe7d2af46f4fbe763ef07e2d46d83c62e11ac91))
- clear oxlint errors for Hono JSX and reporter ([56e9086](https://github.com/jackmcpickle/tokentally/commit/56e908605acb9bb4f226194f7cbbf5e2e4c8af1a))
- cursor token stored raw in state.vscdb, not JSON ([0714cda](https://github.com/jackmcpickle/tokentally/commit/0714cda821694d6c64c886917b75571bad73cd31))
- drop Claude Code <synthetic> models and add pricing page ([b63a744](https://github.com/jackmcpickle/tokentally/commit/b63a74441573c128e9aa6cb3751033676fcc9dc3))
- lint + format for CI ([af00a90](https://github.com/jackmcpickle/tokentally/commit/af00a90f27e362026a1ce4d2e6b5d0becd98515f))
- never post partial cursor day sums ([156cad5](https://github.com/jackmcpickle/tokentally/commit/156cad55aed60e4482df046c228f1214e4eb70c3))
- polish header, skip-link, and invite-only start layout ([e76b3ce](https://github.com/jackmcpickle/tokentally/commit/e76b3ce3454b4e53160e1cb8b9770d3c1f208505))
- render share card text via bundled Inter fonts, drop profile img preview ([d9dd7c8](https://github.com/jackmcpickle/tokentally/commit/d9dd7c8ea4c66469fe0a435a01a60b0139c39cca))
- **reporter:** exclude inherited Codex subagent history from token totals ([#15](https://github.com/jackmcpickle/tokentally/issues/15)) ([04bd51a](https://github.com/jackmcpickle/tokentally/commit/04bd51af47c1bf3409b816a62a8f40fc86d78993))
- resolve symlinked bin path so global/npx invocation runs ([50b668d](https://github.com/jackmcpickle/tokentally/commit/50b668d070820ce5e8794aba5be175bcad14cb06))
- run build:css via wrangler custom build ([6523987](https://github.com/jackmcpickle/tokentally/commit/6523987940fdb39e0b51b5fffd1a95d9a46dd0c1))
- serve HTML with OG tags to Slack and other link-preview bots ([1fd70a5](https://github.com/jackmcpickle/tokentally/commit/1fd70a5f4168d29307e4eb12823036062e0a5c83))
- set Vary on HTML agent discovery responses ([c275472](https://github.com/jackmcpickle/tokentally/commit/c27547278efc74b92e42da295580c9ce80faa028))
