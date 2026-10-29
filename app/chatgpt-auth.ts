import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
export const SESSION_COOKIE = "nexo_session";
const SESSION_DAYS = 7;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (userId && email) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName = encodedFullName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;
    return { userId, displayName: fullName ?? email, email, fullName };
  }

  const token = cookieValue(requestHeaders.get("cookie"), SESSION_COOKIE);
  if (!token || !env.NEXO_ADMIN_PASSWORD) return null;
  if (!(await verifySessionToken(token, env.NEXO_ADMIN_PASSWORD))) return null;
  const adminEmail = env.NEXO_ADMIN_EMAIL || "nicolchauca@gmail.com";
  return {
    userId: env.NEXO_OWNER_ID || await existingWorkspaceOwnerId() || "nexo-owner",
    displayName: "Nexo Ventas Hábitos",
    email: adminEmail,
    fullName: "Nexo Ventas Hábitos",
  };
}

async function existingWorkspaceOwnerId(): Promise<string | null> {
  if (!env.DB) return null;
  try {
    const channel = await env.DB.prepare(
      `SELECT workspace_owner_id
         FROM whatsapp_channels
        ORDER BY enabled DESC, updated_at DESC
        LIMIT 1`,
    ).first<{ workspace_owner_id: string }>();
    if (channel?.workspace_owner_id) return channel.workspace_owner_id;

    const workspace = await env.DB.prepare(
      `SELECT owner_id
         FROM workspaces
        WHERE owner_id <> 'nexo-owner'
        ORDER BY updated_at DESC
        LIMIT 1`,
    ).first<{ owner_id: string }>();
    return workspace?.owner_id || null;
  } catch {
    return null;
  }
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `/login?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  return `/api/auth/logout?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function createSessionToken(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const payload = `v1.${expires}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const [version, rawExpires, signature, extra] = token.split(".");
  if (version !== "v1" || !rawExpires || !signature || extra) return false;
  const expires = Number(rawExpires);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = await sign(`${version}.${rawExpires}`, secret);
  return timingSafeEqual(signature, expected);
}

export function safeRelativeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname.startsWith("/api/auth")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function safeDecodeURIComponent(value: string): string | null {
  try { return decodeURIComponent(value); } catch { return null; }
}
