import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A pages-router rule. It reads .next/server/pages and flags plain
      // <a> links to app-router API routes, which must not be <Link>.
      "@next/next/no-html-link-for-pages": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='Link'] > JSXAttribute[name.name='href'][value.value=/^\\/api\\//]",
          message:
            "Link prefetches its href as page data. Use a plain <a> for /api routes.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Pro Bono has independent dependencies and checks.
    "apps/probono/**",
    // The PR review agent has its own package and typecheck.
    "agents/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "coverage/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare build output and the data module generated before each build.
    ".open-next/**",
    ".wrangler/**",
    "src/lib/bundled-files.generated.ts",
  ]),
]);

export default eslintConfig;
