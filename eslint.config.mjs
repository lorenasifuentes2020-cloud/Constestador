import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".sites-runtime/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // The imported application validates these dynamic payloads with Zod at
    // runtime. Keep that boundary explicit without forcing unsafe casts only
    // to satisfy a stylistic lint rule.
    files: [
      "app/workspace-app.tsx",
      "app/api/workspace/route.ts",
      "lib/domain.ts",
      "tests/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["app/workspace-app.tsx"],
    rules: {
      // The brand link is intercepted to reset the in-app workspace view.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["app/team/team-panel.tsx"],
    rules: {
      // This effect performs the initial remote team fetch; state updates occur
      // only after the request settles.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
