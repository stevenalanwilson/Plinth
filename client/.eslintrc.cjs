module.exports = {
  extends: [
    '../.eslintrc.cjs',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  plugins: ['react', 'react-hooks'],
  env: { browser: true, es2022: true },
  settings: { react: { version: 'detect' } },
  rules: {
    // Not needed with React 17+ automatic JSX transform
    'react/react-in-jsx-scope': 'off',
    // Allow inline arrow functions and callbacks without explicit return types
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: true, allowTypedFunctionExpressions: true },
    ],
  },
};
