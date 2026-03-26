import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const data = await sql`
      SELECT * FROM export_destinations ORDER BY created_at DESC
    `;
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, config } = body;

    if (!name || !type || !config) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, config" },
        { status: 400 }
      );
    }

    const [data] = await sql`
      INSERT INTO export_destinations (name, type, config)
      VALUES (${name}, ${type}, ${JSON.stringify(config)})
      RETURNING *
    `;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 });
  }

  try {
    await sql`DELETE FROM export_destinations WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
