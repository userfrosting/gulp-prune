import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
        ...globals.node,
        ...globals.mocha
      }
    },
    rules: {
      'no-unused-vars': [ 'error', { vars: 'all', args: 'none' } ]
    }
  }
]
