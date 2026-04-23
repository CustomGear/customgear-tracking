import { NextRequest, NextResponse } from "next/server";
import { getCustomGearTracking } from "@/lib/customgearTracking";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code || !/^CG\d+$/.test(code)) {
      return NextResponse.json({ error: "Invalid code. Use something like CG2001." }, { status: 400 });
    }

    const tracking = await getCustomGearTracking(code);

    // Privacy: do not return UPS tracking number or origin data.
    return NextResponse.json(tracking);
  } catch (err) {
    console.error("CustomGear track error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Tracking lookup failed." }, { status: 500 });
  }
}

