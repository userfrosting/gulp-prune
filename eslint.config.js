import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
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
