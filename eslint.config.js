// eslint.config.js
const globals = require('globals');
const tseslint = require('typescript-eslint');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = tseslint.config(
  { // Global ignores
    ignores: [
      'node_modules/',
      'dist/',
      '.eslintrc.js', // old config file, to prevent it from being processed
      'eslint.config.js',
      'eslint.config.mjs',
      // eslint.config.js itself is typically ignored by ESLint v9 by default
    ],
  },
  // Base TypeScript recommended rules, including parser and plugin setup.
  // recommendedTypeChecked enables rules that require type information.
  ...tseslint.configs.recommendedTypeChecked,
  { // Custom project-specific configurations and overrides
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.json', // Path to your tsconfig.json
        tsconfigRootDir: __dirname, // Ensures tsconfig.json is found relative to the project root
        sourceType: 'module',     // As specified in your original .eslintrc.js
      },
      globals: {
        ...globals.node,  // Enables Node.js global variables
        ...globals.jest,  // Enables Jest global variables
      },
    },
    rules: {
      // Your existing custom rules from .eslintrc.js
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Add any other project-specific rules here if needed
    },
  },
  // Prettier configuration. This should be last to override any conflicting formatting rules.
  prettierRecommended
);
