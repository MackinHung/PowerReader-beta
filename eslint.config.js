/**
 * ESLint 9 Flat Configuration
 *
 * Navigation:
 * - Upstream: package.json, .github/workflows/deploy.yml
 * - Downstream: All src/ and shared/ files
 * - Maintainer: T07 (Deployment & Monitoring Team)
 */

export default [
  {
    files: ['src/**/*.js', 'shared/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Cloudflare Workers globals
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        // Web Platform APIs (available in Workers)
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        caches: 'readonly',
        // Node.js globals (for scripts)
        process: 'readonly',
      },
    },
    rules: {
      // Error prevention
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',

      // Security (CLAUDE.md requirements)
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Code quality
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    // Ignore build artifacts and dependencies
    ignores: [
      'node_modules/**',
      'dist/**',
      'T05_REWARD_SYSTEM/**',
      '**/*.test.js',
      '**/*.spec.js',
    ],
  },
];
