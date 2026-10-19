import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Native ONNX runtime for the scene gate (lib/verification/scene-gate.ts): load from node_modules, never bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  partialPrefetching: true,
  turbopack: {
    // thresholds.json is shared with the human-operated tuning harness at the repository root.
    root: join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
