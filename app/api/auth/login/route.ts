import { env } from "cloudflare:workers";
import { createSessionToken, safeRelativeReturnPath, SESSION_COOKIE } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!env.NEXO_ADMIN_PASSWORD) {
    return Response.json({ error: "El acceso todavía no está configurado en Cloudflare." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { pin?: unknown; returnTo?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{6}$/.test(pin) || !(await sameSecret(pin, env.NEXO_ADMIN_PASSWORD))) {
    return Response.json({ error: "PIN incorrecto." }, { status: 401 });
  }
  const token = await createSessionToken(env.NEXO_ADMIN_PASSWORD);
  const returnTo = safeRelativeReturnPath(typeof body?.returnTo === "string" ? body.returnTo : "/");
  return Response.json({ ok: true, returnTo }, { headers: {
    "Cache-Control": "no-store",
    "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
  } });
}

async function sameSecret(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
