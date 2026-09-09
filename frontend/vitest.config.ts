import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests only. Playwright owns tests/e2e and must not be picked up here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    // Mirrors the "paths" block in tsconfig.json.
    alias: {
      "@/lib": path.resolve(__dirname, "src/lib"),
      "@/components": path.resolve(__dirname, "src/components"),
      "@/hooks": path.resolve(__dirname, "src/hooks"),
      "@/services": path.resolve(__dirname, "src/services"),
      "@/types": path.resolve(__dirname, "src/types"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
