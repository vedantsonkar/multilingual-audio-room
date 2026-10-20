import { build } from "esbuild";
await build({ entryPoints: ["src/lib/audio/capture-worklet.ts"], outfile: "public/audio/capture-worklet.js", bundle: true, format: "iife", target: "es2022", minify: true });
