import { NextResponse } from "next/server";
import { getTerminalSnapshot, getTerminalCwd, killTerminal, resizeTerminal, writeTerminal } from "@/lib/terminal-manager";

import { saveTerminalImages, terminalImagePaste, validateTerminalImages } from "@/lib/terminal-images";
import type { Base64ImageAttachment } from "@/lib/image-attachments";

import { saveTerminalFiles, validateTerminalFiles } from "@/lib/terminal-files";
import { parseFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { MAX_DROP_TOTAL_BYTES } from "@/lib/file-drop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cwd = getTerminalCwd(id);
  return cwd
    ? NextResponse.json({ id, cwd, readOnly: getTerminalSnapshot(id)?.exited ?? true })
    : NextResponse.json({ error: "Terminal expired or closed" }, { status: 404 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const cwd = getTerminalCwd(id);
      if (!cwd || !getTerminalSnapshot(id) || getTerminalSnapshot(id)?.exited)
        return NextResponse.json({ error: "Terminal expired or closed" }, { status: 404 });
      const form = await parseFormDataWithinLimit(req, MAX_DROP_TOTAL_BYTES + 1024 * 1024);
      const files = form.getAll("files").filter((file): file is File => typeof file !== "string");
      const error = validateTerminalFiles(files);
      if (error) return NextResponse.json({ error }, { status: 400 });
      const paths = await saveTerminalFiles(cwd, files);
      return writeTerminal(id, terminalImagePaste(paths, form.get("bracketed") === "true"))
        ? NextResponse.json({ success: true })
        : NextResponse.json({ error: "Terminal closed while uploading files" }, { status: 409 });
    }
    const body = await req.json() as { type?: unknown; data?: unknown; cols?: unknown; rows?: unknown; images?: unknown; bracketed?: unknown };
    if (body.type === "images") {
      const error = validateTerminalImages(body.images);
      if (error) return NextResponse.json({ error }, { status: 400 });
      const cwd = getTerminalCwd(id);
      if (!cwd || !getTerminalSnapshot(id) || getTerminalSnapshot(id)?.exited) {
        return NextResponse.json({ error: "Terminal expired or closed" }, { status: 404 });
      }
      const paths = await saveTerminalImages(cwd, body.images as Base64ImageAttachment[]);
      return writeTerminal(id, terminalImagePaste(paths, body.bracketed === true))
        ? NextResponse.json({ success: true })
        : NextResponse.json({ error: "Terminal closed while uploading images" }, { status: 409 });
    }
    if (body.type === "input" && typeof body.data === "string" && body.data.length <= 64 * 1024) {
      return writeTerminal(id, body.data)
        ? NextResponse.json({ success: true })
        : NextResponse.json({ error: "Terminal not found" }, { status: 404 });
    }
    if (body.type === "resize" && Number.isInteger(body.cols) && Number.isInteger(body.rows)
      && (body.cols as number) >= 2 && (body.cols as number) <= 1000
      && (body.rows as number) >= 2 && (body.rows as number) <= 1000) {
      return resizeTerminal(id, body.cols as number, body.rows as number)
        ? NextResponse.json({ success: true })
        : NextResponse.json({ error: "Terminal not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid terminal command" }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Uploads must total 100MB or less" }, { status: 413 });
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  killTerminal(id);
  return NextResponse.json({ success: true });
}
