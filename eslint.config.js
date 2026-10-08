// ESLint (flat config). Awalnya non-blocking di CI — perbaiki temuan lalu hapus `continue-on-error` di .github/workflows/ci.yml.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'bot/**', 'api/**', '.figma/**', 'public/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn', // Row = Record<string, any> dll. — ganti bertahap dengan tipe hasil `supabase gen types`
    },
  },
)
