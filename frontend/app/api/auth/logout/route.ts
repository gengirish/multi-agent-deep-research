import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";
import { serverError } from "@/lib/api-utils";

export async function POST() {
  try {
    const response = NextResponse.json({ message: "Logged out" });
    clearAuthCookie(response);
    return response;
  } catch (err) {
    return serverError(err, "logout");
  }
}
