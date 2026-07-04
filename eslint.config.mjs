// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores. NOTE: `ignores` only applies globally when it is the SOLE
  // key in its own config object — combining it with `rules` silently scopes
  // it to that object instead (flat-config trap).
  { ignores: [".wrangler/", "dist/", "node_modules/"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
