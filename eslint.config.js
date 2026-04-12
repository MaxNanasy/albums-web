import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['*.js', 'src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      // parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tests/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        // ecmaVersion: 'latest',
        // sourceType: 'module',
      },
    },
    // plugins: {
    //   '@typescript-eslint': tsPlugin,
    // },
    // rules: {
    //   '@typescript-eslint/no-unsafe-assignment': 'error',
    //   '@typescript-eslint/no-unsafe-type-assertion': 'error',
    // },
  },
);
