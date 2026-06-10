const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

// Focused config: catch real problems (undefined vars, dead code, hook misuse).
// Formatting is owned by Prettier, so no stylistic rules here.
const unusedVars = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

module.exports = [
  { ignores: ['**/node_modules/**', 'client/dist/**', 'client/public/**'] },

  js.configs.recommended,

  // Empty catch blocks are an intentional "best effort, ignore failure" pattern here.
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },

  // Server, scripts, seed, tests, root config files — Node / CommonJS.
  {
    files: [
      'server/**/*.js',
      'scripts/**/*.{js,cjs}',
      'seed-data/**/*.js',
      'tests/**/*.js',
      '*.{js,cjs}',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': unusedVars },
  },

  // Client — browser, ES modules, JSX/React.
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': unusedVars,
      'react/jsx-uses-vars': 'error', // count components used in JSX as "used"
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
