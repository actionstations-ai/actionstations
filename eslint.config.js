import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'out',
      'dist',
      'release',
      'coverage',
      'reference',
      '.tmp',
      // Top-level dot folders (local tool state, hooks): nothing to lint.
      '.*/**',
      'test-results',
      'playwright-report',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Vendor SDKs / raw network only inside provider adapters (CONTRIBUTING.md, Project rules 4).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/main/providers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@anthropic-ai/*', 'openai', 'ollama'],
              message: 'Provider SDKs only inside src/main/providers/*',
            },
            {
              // #433: providers are built only in providers/resolve.ts, which wraps cloud ones in
              // the outbound gate. Building one elsewhere would bypass preview and redaction.
              group: ['**/providers/registry'],
              importNames: ['createTextProvider', 'createEmbeddingProvider', 'createMediaProvider'],
              message: 'Get providers from providers/resolve (outbound gate), not the registry',
            },
            {
              group: ['**/providers/text/**/adapter', '**/providers/media/**/adapter'],
              message:
                'Get providers from providers/resolve (outbound gate), not an adapter module',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Renderer must go through window.api; never touch Node or ipcRenderer directly.
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'fs', 'node:fs', 'path', 'node:path', 'child_process'],
          patterns: [
            {
              group: ['@anthropic-ai/*', 'openai', 'ollama', '@main/*'],
              message: 'Renderer talks to main only via window.api',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
