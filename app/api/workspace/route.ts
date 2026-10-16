import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { mutateWorkspace, DomainError, type Workspace } from '../../../lib/domain';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers});}
async function context(){const user=await getChatGPTUser();if(!user)throw Object.assign(new Error('Inicia sesión para acceder a tus tiendas.'),{status:401});if(!env.DB)throw Object.assign(new Error('El almacenamiento no está disponible.'),{status:503});return {ownerId:user.userId,db:env.DB};}
function failure(e:unknown){if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'Revisa los campos.'},400);if(e instanceof DomainError)return json({error:e.message},400);const err=e as any;console.error('Workspace operation failed',err?.name);return json({error:err.status?err.message:'No se pudo guardar. Tus cambios no se han aplicado. Inténtalo de nuevo.'},err.status||500);}
export async function GET(){try{const {ownerId,db}=await context();const row=await db.prepare('SELECT payload, version FROM workspaces WHERE owner_id = ?').bind(ownerId).first<{payload:string;version:number}>();return json(row?{workspace:JSON.parse(row.payload),version:row.version}:{workspace:{stores:[]},version:0});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origen no permitido.'},403);
 const {ownerId,db}=await context();const raw=await request.text();if(raw.length>100000)return json({error:'Solicitud demasiado grande.'},413);
 let parsed;try{parsed=JSON.parse(raw);}catch{return json({error:'Solicitud inválida.'},400);}
 const body=z.object({version:z.number().int().nonnegative(),type:z.string().max(100),payload:z.unknown()}).parse(parsed);
 // Ensure the owner aggregate exists before optimistic writes. No schema changes at runtime.
 await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id, payload, version, updated_at) VALUES (?, ?, 0, ?)').bind(ownerId,JSON.stringify({stores:[]}),new Date().toISOString()).run();
 const row=await db.prepare('SELECT payload, version FROM workspaces WHERE owner_id = ?').bind(ownerId).first<{payload:string;version:number}>();
 if(!row||row.version!==body.version)return json({error:'Hay cambios guardados desde otra pestaña. Actualiza para verlos antes de continuar.'},409);
 const workspace=mutateWorkspace(JSON.parse(row.payload) as Workspace,body.type,body.payload);
 const result=await db.prepare('UPDATE workspaces SET payload = ?, version = version + 1, updated_at = ? WHERE owner_id = ? AND version = ?').bind(JSON.stringify(workspace),new Date().toISOString(),ownerId,body.version).run();
 if(result.meta.changes!==1)return json({error:'Otro cambio se guardó al mismo tiempo. Actualiza la página antes de continuar.'},409);
 return json({workspace,version:row.version+1});
 }catch(e){return failure(e);}}
