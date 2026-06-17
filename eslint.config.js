import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  // Node globals for config/scripts (eleventy, build scripts)
  {
    files: ["eleventy.config.js", "scripts/**/*.js", "lib/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Browser globals for listen app (runs in browser, not Node)
  {
    files: ["src/listen/listen-app.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        Sortable: "readonly",
      },
    },
  },
  // Browser globals for WASM bindings (generated code)
  {
    files: ["src/listen/wasm/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Web Worker globals for listen worker
  {
    files: ["src/listen/listen-worker.js"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    ignores: ["_site/", "node_modules/", "dist/", "src/listen/vendor/", "src/listen/wasm/"],
  },
];
