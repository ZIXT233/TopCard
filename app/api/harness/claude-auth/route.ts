import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  readClaudeHarnessAuth,
  writeClaudeHarnessAuth,
  type ClaudeHarnessAuth,
} from "@/lib/harness/claude-auth";

export const dynamic = "force-dynamic";

function publicStatus(auth: ClaudeHarnessAuth) {
  return {
    hasKey: Boolean(auth.apiKey),
    baseUrl: auth.baseUrl ?? "",
  };
}

export async function GET() {
  try {
    return NextResponse.json(publicStatus(await readClaudeHarnessAuth()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const body = await req.json() as { apiKey?: unknown; baseUrl?: unknown };
    if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
      return NextResponse.json({ error: "apiKey must be a string" }, { status: 400 });
    }
    if (body.baseUrl !== undefined && typeof body.baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl must be a string" }, { status: 400 });
    }
    const auth = await writeClaudeHarnessAuth({
      ...(body.apiKey !== undefined ? { apiKey: body.apiKey } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
    });
    return NextResponse.json(publicStatus(auth));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Base URL") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  try {
    return NextResponse.json(publicStatus(await writeClaudeHarnessAuth({ apiKey: "", baseUrl: "" })));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
