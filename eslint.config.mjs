export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'max-len': ['error', {
        code: 80,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
      }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['node_modules/'],
  },
];
