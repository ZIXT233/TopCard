import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSshWorkspace, sshExec, shellQuote } from "./ssh-workspace";
import { validateUploadFileNames } from "./file-upload";
import { dropFilesError } from "./file-drop";

export function validateTerminalFiles(files: File[]): string | null {
  return dropFilesError(files) || validateUploadFileNames(files.map((file) => file.name))
    || (files.some((file) => /[\x00-\x1f\x7f]/.test(file.name)) ? "Invalid control character in filename" : null);
}

export async function saveTerminalFiles(cwd: string, files: File[]): Promise<string[]> {
  const remote = await loadSshWorkspace(cwd);
  const directory = remote
    ? (await sshExec(remote.sshHost, "umask 077; mktemp -d /tmp/topcard-files-XXXXXXXX")).toString().trim()
    : await mkdtemp(join(tmpdir(), "topcard-files-"));
  if (remote && !/^\/tmp\/topcard-files-[a-zA-Z0-9]+$/.test(directory)) throw new Error("Invalid remote upload directory");
  const paths: string[] = [];
  try {
    for (const file of files) {
      const path = remote ? `${directory}/${file.name}` : join(directory, file.name);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (remote) await sshExec(remote.sshHost, `umask 077; cat > ${shellQuote(path)}`, bytes);
      else await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
      paths.push(path);
    }
    return paths;
  } catch (error) {
    if (remote) await sshExec(remote.sshHost, `rm -rf -- ${shellQuote(directory)}`).catch(() => {});
    else await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
