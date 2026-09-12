import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateAgentImages, type Base64ImageAttachment } from "./image-attachments";
import { loadSshWorkspace, sshExec, shellQuote } from "./ssh-workspace";

/** Do not trust the filename or MIME supplied by a clipboard/web client. */
export function terminalImageExtension(data: Buffer): string {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpg";
  if (/^GIF8[79]a/.test(data.subarray(0, 6).toString())) return "gif";
  if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") return "webp";
  throw new Error("Unsupported image. Paste a PNG, JPEG, GIF or WebP image.");
}

export function validateTerminalImages(images: unknown): string | null {
  const error = validateAgentImages(images);
  if (error) return error;
  if (!Array.isArray(images) || images.length === 0) return "No images to paste";
  try { for (const image of images) terminalImageExtension(Buffer.from(image.data, "base64")); }
  catch (error) { return (error as Error).message; }
  return null;
}

export async function saveTerminalImages(cwd: string, images: Base64ImageAttachment[]): Promise<string[]> {
  const remote = await loadSshWorkspace(cwd);
  const paths: string[] = [];
  // Keep attachments beyond the paste: the agent may read them only after submit.
  // Use OS temporary storage rather than polluting the user's project.
  const directory = remote
    ? (await sshExec(remote.sshHost, "umask 077; mktemp -d /tmp/topcard-images-XXXXXXXX")).toString().trim()
    : await mkdtemp(join(tmpdir(), "topcard-images-"));
  if (!directory.startsWith("/") && process.platform !== "win32") throw new Error("Invalid image directory");
  for (const image of images) {
    const bytes = Buffer.from(image.data, "base64");
    const name = `${randomUUID()}.${terminalImageExtension(bytes)}`;
    const path = remote ? `${directory}/${name}` : join(directory, name);
    if (remote) await sshExec(remote.sshHost, `umask 077; cat > ${shellQuote(path)}`, bytes);
    else await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    paths.push(path);
  }
  return paths;
}

export function terminalImagePaste(paths: string[], bracketed: boolean): string {
  const text = paths.map((path) => /[\s'"`$;&|<>()[\]{}!*?\\]/.test(path)
    ? (process.platform === "win32" ? `"${path.replaceAll('"', '""')}"` : shellQuote(path))
    : path).join(" ") + " ";
  return bracketed ? `\x1b[200~${text}\x1b[201~` : text;
}
