/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-console": "warn",
  },
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
      ],
      plugins: ["@typescript-eslint"],
      rules: {
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-console": "warn",
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        "@typescript-eslint/no-explicit-any": "warn",
      },
    },
  ],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "dashboard/.next/",
    "dashboard/node_modules/",
    "reports/",
    "training/",
    "tmp_*",
  ],
};
