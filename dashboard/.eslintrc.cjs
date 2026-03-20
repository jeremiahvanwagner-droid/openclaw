/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  rules: {
    "no-eval": "error",
    "no-implied-eval": "error",
  },
};
