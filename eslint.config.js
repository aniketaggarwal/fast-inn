const globals = require("globals");
const react = require("eslint-plugin-react");

module.exports = [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // next is required to make Express recognize a 4-arg function as
      // error-handling middleware, even in handlers that don't call it.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^next$" }],
      "no-undef": "error",
    },
  },
  {
    files: ["**/test/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    // web/ is a Vite+React app: ESM (import/export, import.meta), not
    // CommonJS like the backend services — matching standard Vite
    // conventions here is less friction than forcing require() through
    // Vite's own module system.
    files: ["web/**/*.{js,jsx}"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      // Without this, plain no-unused-vars doesn't know <Foo /> in JSX
      // counts as using the Foo identifier, and flags every component
      // import as unused.
      "react/jsx-uses-vars": "error",
    },
  },
];
