import { safeRelativeReturnPath, SESSION_COOKIE } from "../../../chatgpt-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return new Response(null, { status: 303, headers: {
    Location: safeRelativeReturnPath(url.searchParams.get("return_to")),
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  } });
}
