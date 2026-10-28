// @ts-check
import eslintConfigPrettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    files: ['**/*.vue'],
    rules: {
      // Multi-word rule is noise for Nuxt pages/layouts (index.vue, login.vue, default.vue).
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.{ts,vue,mjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Must stay last: disables stylistic rules that would conflict with Prettier.
  eslintConfigPrettier,
)
