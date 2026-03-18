import path from "node:path";
import { defineConfig } from "vitest/config";

const LARGE_STATIC_ASSETS = [
  "**/*.glb",
  "**/*.gltf",
  "**/*.bin",
  "**/*.ogg",
  "**/*.mp3",
  "**/*.wav",
  "**/*.webm",
];

function assetFileName(assetName: string | undefined): string {
  const ext = path.extname(assetName ?? "").toLowerCase();

  if (ext === ".glb" || ext === ".gltf" || ext === ".bin") {
    return "assets/models/[name]-[hash][extname]";
  }

  if (ext === ".ogg" || ext === ".mp3" || ext === ".wav" || ext === ".webm") {
    return "assets/audio/[name]-[hash][extname]";
  }

  return "assets/misc/[name]-[hash][extname]";
}

export default defineConfig(({ mode }) => ({
  publicDir: "public",
  assetsInclude: LARGE_STATIC_ASSETS,
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
  define: {
    __DEV__: JSON.stringify(mode !== "production"),
  },
  esbuild: {
    target: "es2022",
    legalComments: "none" as const,
  },
  optimizeDeps: {
    // Keep Babylon packages on the same module path in dev so loader plugins
    // register against the same SceneLoader instance the game uses.
    exclude: ["@babylonjs/core", "@babylonjs/loaders", "@babylonjs/gui"],
  },
  build: {
    target: "es2022",
    sourcemap: mode !== "production",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id: string) => id.includes("@babylonjs/loaders"),
      },
      output: {
        entryFileNames: "entries/[name]-[hash].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => assetFileName(assetInfo.name),
        manualChunks: {
          babylon: ["@babylonjs/core", "@babylonjs/gui", "@babylonjs/loaders"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,ts}"],
  },
}));
