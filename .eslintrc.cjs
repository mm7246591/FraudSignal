module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:vue/recommended',
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'plugin:tailwindcss/recommended',
    'plugin:prettier/recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  settings: {
    'import/resolver': {
      alias: {
        map: [['@', './src']],
        extensions: ['.js', '.ts', '.vue', '.scss', '.css'],
      },
    },
    tailwindcss: {
      config: 'tailwind.config.js',
    },
  },
  rules: {
    'no-plusplus': 'off',
    'no-console': 'off',
    'no-use-before-define': 'off',
    'no-unused-vars': 'off',
    'import/prefer-default-export': 'off',
    // Vite 的 ?raw、?inline、?url（可加 &no-inline）匯入由打包工具處理，import 外掛解析不到。
    'import/no-unresolved': [
      'error',
      { ignore: ['[?](raw|inline|url)(&no-inline)?$'] },
    ],
    'import/extensions': [
      'error',
      'ignorePackages',
      { js: 'never', ts: 'never', vue: 'always' },
    ],
    'tailwindcss/classnames-order': 'warn',
    'tailwindcss/no-custom-classname': 'error',
    'tailwindcss/no-contradicting-classname': 'warn',
    // 使用明確 px 數值，保留 w-[32px] h-[32px] 等寫法。
    'tailwindcss/enforces-shorthand': 'off',
    'tailwindcss/no-unnecessary-arbitrary-value': 'off',
    'no-irregular-whitespace': ['error', { skipTemplates: true }],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          'src/__tests__/**/*.ts',
          '*.config.*',
          '.eslintrc.cjs',
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.vue'],
      rules: { 'no-undef': 'off' },
    },
  ],
};
