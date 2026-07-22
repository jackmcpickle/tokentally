import { defineConfig } from 'oxfmt';

export default defineConfig({
    semi: true,
    singleQuote: true,
    printWidth: 80,
    jsxSingleQuote: false,
    bracketSameLine: false,
    arrowParens: 'always',
    proseWrap: 'preserve',
    singleAttributePerLine: true,
    htmlWhitespaceSensitivity: 'css',
    useTabs: false,
    endOfLine: 'lf',
    trailingComma: 'all',
    tabWidth: 4,
    insertFinalNewline: true,
    sortTailwindcss: {
        stylesheet: './src/styles/tailwind.css',
        functions: ['cn', 'clsx', 'cva', 'cx'],
        attributes: ['class', 'classList', 'className'],
    },
    sortImports: {
        groups: [
            ['builtin'],
            ['react', 'external', 'type-external'],
            ['internal', 'type-internal'],
            ['parent', 'type-parent'],
            ['sibling', 'type-sibling'],
            ['index', 'type-index'],
        ],
        newlinesBetween: false,
        customGroups: [
            {
                groupName: 'react',
                elementNamePattern: ['react', 'react-*'],
            },
        ],
    },
    overrides: [
        {
            files: ['*.yml', '*.yaml'],
            options: {
                tabWidth: 2,
                singleQuote: false,
            },
        },
    ],
    sortPackageJson: true,
    ignorePatterns: ['dist/**', 'node_modules/**', 'CHANGELOG.md'],
});
