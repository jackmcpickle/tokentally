/**
 * Bundles versioned model ids into stable filter families for the leaderboard UI.
 * Raw model strings stay in the DB; filters match by family (e.g. all Sonnet variants).
 */

const FAMILY_LABELS: Record<string, string> = {
    sonnet: 'Sonnet',
    opus: 'Opus',
    haiku: 'Haiku',
    fable: 'Fable',
    codex: 'Codex',
    gpt: 'GPT',
};

/** Family id for a raw model string, or null to hide from the filter list. */
export function familyOf(model: string): string | null {
    const m = model.toLowerCase().trim();
    if (!m || m.includes('synthetic')) return null;

    if (m.includes('sonnet')) return 'sonnet';
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('fable')) return 'fable';
    // Codex before GPT so gpt-*-codex lands in Codex.
    if (m.includes('codex')) return 'codex';
    if (m.includes('gpt') || /^o[0-9]/u.test(m)) return 'gpt';

    // Unknown: strip date suffixes and trailing version segments.
    const stripped = m
        .replace(/-\d{8}$/u, '')
        .replace(/-\d+(?:\.\d+)*(?:-\d+)*$/u, '');
    return stripped || m;
}

export function familyLabel(family: string): string {
    return FAMILY_LABELS[family] ?? family;
}

/** Unique family ids present in a list of raw model ids, sorted by label. */
export function distinctFamilies(models: string[]): string[] {
    const set = new Set<string>();
    for (const model of models) {
        const family = familyOf(model);
        if (family) set.add(family);
    }
    return [...set].sort((a, b) =>
        familyLabel(a).localeCompare(familyLabel(b)),
    );
}
