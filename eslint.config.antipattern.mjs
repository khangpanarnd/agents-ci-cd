import tseslint from 'typescript-eslint';

// Gate 3 — anti-patterns: what must never appear in the code.
// Magic numbers are only enforced in src/ (tests assert on counts/ids freely).
// server.ts may log at startup — it is the infra entrypoint.
// require-await is a typed rule: these blocks need parserOptions.project.
// `...recommended` enables no-unused-vars with default options, so the `^_`
// exemption (Express middleware arity, see conventions config) is repeated here.
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-magic-numbers': [
        'error',
        { ignore: [-1, 0, 1, 3000, 200, 201, 204, 400, 404, 500] },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/server.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
