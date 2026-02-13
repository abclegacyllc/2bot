import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-admin/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // TypeScript strict rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      
      // React rules
      "react/jsx-no-leaked-render": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // General best practices
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
    },
  },
  // Allow console.log in scripts, test files, and seed files
  {
    files: ["scripts/**", "src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.e2e.test.ts", "prisma/seed.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Relax strictness in test files — any/non-null assertions are common for mocking
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.e2e.test.ts", "src/**/test-helpers/**", "src/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
]);

export default eslintConfig;
