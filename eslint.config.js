import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Lean config focused on correctness (esp. React Hooks rules, which catch the
// hook-ordering / dependency bugs the codebase's hand-rolled useState style can
// hide). Stylistic noise is intentionally dialed down — this app predates lint.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'dev-dist/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The app uses intentional patterns lint would otherwise flag as noise:
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'no-cond-assign': 'off',
      // The codebase uses `false && <JSX>` as intentional feature flags.
      'no-constant-binary-expression': 'warn',
    },
  },
  {
    // Vercel serverless function runs in Node, not the browser.
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
