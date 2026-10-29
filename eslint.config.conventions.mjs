import tseslint from 'typescript-eslint';

// Gate 2 — coding conventions: how the code is written.
// `_`-prefixed params/vars are exempt from no-unused-vars: Express middleware
// requires exact arity (dropping `_next` from the error handler would break
// Express 4 error detection), so the naive "fix" must not be tempting.
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
