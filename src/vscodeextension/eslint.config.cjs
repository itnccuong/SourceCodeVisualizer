const parser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser,
      ecmaVersion: 2018,
      sourceType: 'module',
    },
    // Preserve the previous parser-only lint policy; compilation checks types.
    rules: {},
  },
];
