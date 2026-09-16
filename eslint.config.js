const globals = require("globals");

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
];
