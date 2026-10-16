import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  canAccessWorkspace,
  TEAM_WORKSPACE_COOKIE,
} from '../../../../lib/workspace-access';
import { getChatGPTUser } from '../../../chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  }

  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!env.DB) {
    return NextResponse.json({ error: 'El almacenamiento no está disponible.' }, { status: 503 });
  }

  try {
    const raw = await request.text();
    if (raw.length > 1000) {
      return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    }
    const { ownerId } = z.object({
      ownerId: z.string().min(1).max(200),
    }).parse(JSON.parse(raw));
    if (!await canAccessWorkspace(env.DB, user, ownerId)) {
      return NextResponse.json({ error: 'No tienes acceso a este espacio.' }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(TEAM_WORKSPACE_COOKIE, ownerId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Espacio inválido.' }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }
    console.error('Workspace selection failed', (error as Error)?.name);
    return NextResponse.json({ error: 'No se pudo cambiar de espacio.' }, { status: 500 });
  }
}
