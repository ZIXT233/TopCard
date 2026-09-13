import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { embeddedNodeExecutable, withEmbeddedNodeEnvironment } from "../node-runtime";

export async function bundledPiCommand(environment: NodeJS.ProcessEnv) {
  const root = join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { bin: { pi: string } };
  const entry = join(root, pkg.bin.pi);
  await access(entry);
  return { executable: embeddedNodeExecutable(), args: [entry], env: withEmbeddedNodeEnvironment(environment) };
}
