import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

await build({
  entryPoints: [join(here, "src/index.ts")],
  outfile: join(here, "dist/server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  conditions: ["react-server", "node"],
  logLevel: "info",
  plugins: [
    {
      name: "at-alias",
      setup(b) {
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: join(repo, `${args.path.slice(2)}.ts`),
        }));
      },
    },
  ],
});
