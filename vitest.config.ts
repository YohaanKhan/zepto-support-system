import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" path alias so tests import the same way the app does.
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
