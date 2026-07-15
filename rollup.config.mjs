import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/media-gallery-list-card.ts",
  output: {
    file: "dist/media-gallery-list-card.js",
    format: "es",
    sourcemap: false,
  },
  plugins: [resolve(), typescript(), terser({ format: { comments: false } })],
};
