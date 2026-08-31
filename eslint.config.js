// ESLint flat config (ESLint 9). Scope: application TypeScript only — the QA
// harness scripts (harness/) are throwaway browser-driving tools and stay
// unlinted; generated output and reference data are ignored wholesale.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'server/dist/',
      'node_modules/',
      'public/',
      'harness/',
      'reference/',
      '.claude/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    rules: {
      // main.ts wires the router/detail circular dependency by declaring
      // `let router` and closing over it before assignment — a legitimate
      // read-before-assign, not a missed const.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // The codebase imports types with `import type` everywhere — enforce it.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
