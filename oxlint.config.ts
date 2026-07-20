import { defineConfig } from 'oxlint';

export default defineConfig({
    rules: {
        'require-await': 'off',
        'no-warning-comments': 'off',
        'no-console': [
            'warn',
            {
                allow: ['warn', 'error'],
            },
        ],
        'no-void': [
            'error',
            {
                allowAsStatement: true,
            },
        ],
        'no-undefined': 'off',
        'require-unicode-regexp': 'error',
        'import/no-default-export': 'warn',
        'import/max-dependencies': [
            'error',
            {
                max: 50,
            },
        ],
        'import/no-unassigned-import': [
            'warn',
            {
                allow: ['**/*.css', '**/*.svg'],
            },
        ],
        'max-lines': 'off',
        'max-lines-per-function': [
            'error',
            {
                max: 500,
            },
        ],
        'no-use-before-define': [
            'warn',
            {
                allowNamedExports: false,
                ignoreTypeReferences: true,
                functions: false,
            },
        ],
        'react/react-in-jsx-scope': 'off',
        'react/only-export-components': 'off',
        'react/jsx-no-literals': 'off',
        'react/no-unescaped-entities': 'off',
        'react/no-unknown-property': 'off',
        'react-perf/jsx-no-new-function-as-prop': 'off',
        'react_perf/jsx-no-new-object-as-prop': 'off',
        'react_perf/jsx-no-new-array-as-prop': 'off',
        'func-style': [
            'error',
            'declaration',
            {
                overrides: {
                    namedExports: 'ignore',
                },
            },
        ],
        'typescript/no-floating-promises': [
            'error',
            {
                checkThenables: true,
            },
        ],
        'typescript/strict-boolean-expressions': 'off',
        'typescript/explicit-module-boundary-types': [
            'warn',
            {
                allowArgumentsExplicitlyTypedAsAny: true,
            },
        ],
        'typescript/no-unsafe-type-assertion': 'off',
        'typescript/only-throw-error': 'off',
        'typescript/explicit-function-return-type': [
            'warn',
            {
                allowExpressions: true,
                allowTypedFunctionExpressions: true,
            },
        ],
        'jsx_a11y/anchor-is-valid': 'warn',
        'react/jsx-filename-extension': [
            'warn',
            {
                extensions: ['.jsx', '.tsx'],
            },
        ],
        'react/forbid-component-props': [
            'error',
            {
                forbid: ['style'],
            },
        ],
        'react/no-unstable-nested-components': [
            'warn',
            {
                allowAsProps: true,
            },
        ],
        'typescript/require-await': 'error',
        'no-promise-executor-return': 'error',
        'no-negated-condition': 'error',
        'react/no-object-type-as-default-prop': 'error',
        'typescript/explicit-member-accessibility': 'error',
        'typescript/consistent-return': 'error',
        'typescript/no-unnecessary-type-parameters': 'error',
        'typescript/no-useless-default-assignment': 'error',
        'typescript/no-unnecessary-type-conversion': 'error',
        'no-underscore-dangle': [
            'warn',
            {
                allow: ['_default'],
            },
        ],
        'jsx-a11y/control-has-associated-label': 'error',
        'jsx-a11y/prefer-tag-over-role': 'error',
        'typescript/prefer-readonly-parameter-types': 'off',
    },
    categories: {
        perf: 'error',
        restriction: 'error',
        correctness: 'error',
        suspicious: 'error',
        pedantic: 'warn',
    },
    plugins: [
        'eslint',
        'typescript',
        'import',
        'react',
        'jsx-a11y',
        'react-perf',
    ],
    ignorePatterns: ['node_modules/', 'build/', 'dist/', 'static/'],
    overrides: [
        {
            files: ['*.test.*', '*.spec.*'],
            rules: {
                'no-promise-executor-return': 'off',
                'no-negated-condition': 'off',
                'jsx-a11y/control-has-associated-label': 'off',
                'jsx-a11y/prefer-tag-over-role': 'off',
                'jsx_a11y/anchor-is-valid': 'off',
                'typescript/no-unsafe-member-access': 'off',
                'typescript/no-unsafe-call': 'off',
                'typescript/no-unsafe-argument': 'off',
                'typescript/no-unsafe-return': 'off',
                'typescript/no-unsafe-assignment': 'off',
                'typescript/explicit-function-return-type': 'off',
                'typescript/explicit-module-boundary-types': 'off',
                'typescript/unbound-method': 'off',
                'max-lines-per-function': 'off',
                'typescript/strict-void-return': 'off',
                'typescript/prefer-readonly-parameter-types': 'off',
                'typescript/no-deprecated': 'off',
                'no-inline-comments': 'off',
                'no-underscore-dangle': [
                    'warn',
                    {
                        allow: ['__routeComponent'],
                    },
                ],
            },
        },
        {
            files: ['src/index.tsx'],
            rules: {
                'import/no-default-export': 'off',
                'import/no-relative-parent-imports': 'off',
            },
        },
        {
            files: ['src/pages/layout.tsx'],
            rules: {
                // Tailwind-built stylesheet inlined via wrangler Text rule; the
                // `@/` alias is unresolved by wrangler's esbuild so a relative
                // import is required, and the CSS is inlined intentionally.
                'import/no-relative-parent-imports': 'off',
                'react/no-danger': 'off',
                // Mark + Wordmark live next to Layout as private chrome helpers.
                'react/no-multi-comp': 'off',
            },
        },
        {
            files: ['scripts/**'],
            rules: {
                'no-console': 'off',
            },
        },
        {
            files: [
                'src/__tests__/reporter.test.ts',
                'src/__tests__/reporter-privacy.test.ts',
                'src/__tests__/reporter-cli.test.ts',
                'src/__tests__/reporter-shared.test.ts',
                'src/__tests__/reporter-rows.test.ts',
                'src/__tests__/reporter-collect.test.ts',
                'src/__tests__/reporter-bundle.test.ts',
                'src/__tests__/reporter-claude-sessions.test.ts',
                'src/__tests__/reporter-pi-cursor.test.ts',
            ],
            rules: {
                'import/no-relative-parent-imports': 'off',
                // ?raw default export is provided by vite, invisible to the linter.
                'import/default': 'off',
            },
        },
        {
            // Reporter is a multi-module package bundled to one file; agents
            // intentionally import shared helpers from ../lib.
            files: ['reporter/src/**'],
            rules: {
                'import/no-relative-parent-imports': 'off',
                'import/no-unassigned-import': 'off',
            },
        },
        {
            // Faithful port of CodexBar's rollout counting state machine
            // (which carries the equivalent swiftlint complexity disables);
            // decomposing it would break line-for-line reviewability against
            // the reference implementation.
            files: ['reporter/src/agents/codex-engine.ts'],
            rules: {
                complexity: 'off',
            },
        },
        {
            // Constant-time digest comparison requires XOR-accumulate.
            files: ['src/lib/invite.ts'],
            rules: {
                'no-bitwise': 'off',
            },
        },
        {
            files: ['*.config.ts'],
            rules: {
                'import/no-default-export': 'off',
            },
        },
        {
            files: ['*.d.ts'],
            rules: {
                'import/unambiguous': 'off',
            },
        },
    ],
});
