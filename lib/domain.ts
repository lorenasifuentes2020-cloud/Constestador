import { z } from 'zod';
export type Product = {id:string;name:string;sku:string;category:string;price:number;stock:number;description:string;active:boolean};
export type Contact = {id:string;name:string;phone:string;email:string;stage:string;notes:string};
export type Order = {id:string;number:string;contactId:string;customer:string;items:{productId:string;name:string;quantity:number;price:number}[];total:number;status:string;paymentStatus:string;channel:string;createdAt:string;notes:string};
export type Entry = {id:string;title:string;content:string;active:boolean};
export type Agent = {name:string;tone:string;description:string;greeting:string;instructions:string;shipping:string;payments:string;returns:string};
export type Store = {id:string;name:string;category:string;color:string;createdAt:string;demo:boolean;products:Product[];contacts:Contact[];orders:Order[];faqs:Entry[];rules:Entry[];promotions:Entry[];agent:Agent;modules:{wholesale:boolean;advisors:boolean}};
export type Workspace = {stores:Store[]};
const str=(max=300)=>z.string().trim().max(max);
const required=(max=120)=>str(max).min(1,'Completa los campos obligatorios.');
const id=z.string().min(1).max(100);
const baseStore=z.object({name:required(80),category:required(80),color:z.enum(['plum','green','blue','orange'])});
const product=z.object({id:id.optional(),name:required(),sku:str(60),category:str(80),price:z.number().finite().min(0).max(1e7),stock:z.number().int().min(0).max(1e7),description:str(2000),active:z.boolean()});
const contact=z.object({id:id.optional(),name:required(),phone:str(30),email:z.union([z.literal(''),z.string().email()]).default(''),stage:z.enum(['Nuevo','En conversación','Cliente','Inactivo']),notes:str(2000)});
const entry=z.object({id:id.optional(),title:required(200),content:required(4000),active:z.boolean()});
const agent=z.object({name:required(80),tone:z.enum(['Cercano','Profesional','Entusiasta']),description:str(4000),greeting:str(1000),instructions:str(8000),shipping:str(3000),payments:str(3000),returns:str(3000)});
export const DEFAULT_PAYMENTS='Provincias fuera de Lima: adelanto del 50% del valor de los productos, envío por Shalom y pago posterior del saldo. Lima: opción de pago al recibir en casa con el motorizado. Confirmar con la tienda el momento exacto del saldo y los costos de envío. Un adelanto no es un pago completo.';
export const DEFAULT_SHIPPING='Provincias fuera de Lima: envío por Shalom después del adelanto del 50% del valor de los productos. Lima: entrega a domicilio con motorizado y opción de pago al recibir. Confirmar cobertura, tarifa y plazos con la tienda.';
const uid=()=>crypto.randomUUID();
export function createStore(input:z.infer<typeof baseStore>,demo=false):Store{return {id:uid(),...input,createdAt:new Date().toISOString(),demo,products:[],contacts:[],orders:[],faqs:[],rules:[],promotions:[],agent:{name:'Asistente de '+input.name,tone:'Cercano',description:'',greeting:'¡Hola! Bienvenido a '+input.name+'. ¿En qué puedo ayudarte?',instructions:'No inventes precios ni disponibilidad. Consulta el catálogo y deriva a una persona cuando no tengas información suficiente.',shipping:DEFAULT_SHIPPING,payments:DEFAULT_PAYMENTS,returns:''},modules:{wholesale:false,advisors:false}};}
export class DomainError extends Error {status=400;}
export function mutateWorkspace(current:Workspace,type:string,payload:any):Workspace {
 const w:Workspace=structuredClone(current);
 if(type==='store.create'){if(w.stores.length>=5)throw new DomainError('Límite de 5 tiendas alcanzado.');w.stores.push(createStore(baseStore.parse(payload)));return w;}
 if(type==='demo.load'){
  if(w.stores.some(s=>s.demo))throw new DomainError('Ya tienes tiendas de ejemplo.');
  if(w.stores.length>2)throw new DomainError('No hay espacio para tres tiendas de ejemplo.');
  for(const [n,c,col,items] of [
   ['Luna Studio','Moda y accesorios','plum',[['Blusa Alba','BL-001',89,24],['Bolso Arena','BO-001',139,12],['Vestido Aurora','VE-001',159,8]]],
   ['Nativa Beauty','Belleza y cuidado','green',[['Sérum Botánico','SE-001',69,32],['Crema Hidratante','CR-001',49,18]]],
   ['Casa Nube','Hogar y decoración','orange',[['Lámpara Nube','LA-001',189,5],['Jarrón Tierra','JA-001',79,14]]]
  ] as any[]){const s=createStore({name:n,category:c,color:col},true);s.products=items.map((x:any)=>({id:uid(),name:x[0],sku:x[1],price:x[2],stock:x[3],category:c,description:'Producto de ejemplo para explorar el sistema.',active:true}));s.contacts=[{id:uid(),name:'Cliente de ejemplo',phone:'',email:'',stage:'Nuevo',notes:'Datos ficticios. Puedes crear tus propios contactos.'}];s.agent.shipping='Envíos de ejemplo a Lima y provincias. Confirmar cobertura y costo antes de cerrar el pedido.';w.stores.push(s);}
  return w;
 }
 const storeId=id.parse(payload.storeId);const s=w.stores.find(s=>s.id===storeId);if(!s)throw new DomainError('La tienda no existe o no pertenece a tu espacio.');
 function upsert<T extends {id:string}>(list:T[],data:any){if(data.id){const i=list.findIndex(x=>x.id===data.id);if(i<0)throw new DomainError('Registro no encontrado en esta tienda.');list[i]={...data,id:data.id};}else{if(list.length>=1500)throw new DomainError('Límite de registros alcanzado.');list.unshift({...data,id:uid()});}}
 switch(type){
 case 'store.update':Object.assign(s,baseStore.parse(payload));break;
 case 'product.save':{const p=product.parse(payload);if(p.sku&&s.products.some(x=>x.sku===p.sku&&x.id!==p.id))throw new DomainError('Ya existe un producto con ese SKU en esta tienda.');upsert(s.products,p);break;}
 case 'contact.save':upsert(s.contacts,contact.parse(payload));break;
 case 'agent.save':s.agent=agent.parse(payload);break;
 case 'faq.save':upsert(s.faqs,entry.parse(payload));break;
 case 'rule.save':upsert(s.rules,entry.parse(payload));break;
 case 'promotion.save':upsert(s.promotions,entry.parse(payload));break;
 case 'modules.save':s.modules=z.object({wholesale:z.boolean(),advisors:z.boolean()}).parse(payload);break;
 case 'order.create':{
  const o=z.object({contactId:id,items:z.array(z.object({productId:id,quantity:z.number().int().min(1).max(10000)})).min(1).max(50),channel:z.enum(['Manual','WhatsApp','Instagram','Web']),notes:str(2000),paymentStatus:z.enum(['Pendiente','Pagado'])}).parse(payload);
  const c=s.contacts.find(c=>c.id===o.contactId);if(!c)throw new DomainError('Selecciona un cliente de esta tienda.');
  const quantities=new Map<string,number>();o.items.forEach(x=>quantities.set(x.productId,(quantities.get(x.productId)||0)+x.quantity));
  const lines=Array.from(quantities,([productId,quantity])=>{const p=s.products.find(p=>p.id===productId&&p.active);if(!p)throw new DomainError('Producto no disponible en esta tienda.');if(p.stock<quantity)throw new DomainError('Stock insuficiente para '+p.name+'.');return {productId,name:p.name,quantity,price:p.price};});
  for(const l of lines)s.products.find(p=>p.id===l.productId)!.stock-=l.quantity;
  const total=Math.round(lines.reduce((a,l)=>a+l.price*l.quantity,0)*100)/100;
  s.orders.unshift({id:uid(),number:'NX-'+String(s.orders.length+1).padStart(4,'0'),contactId:c.id,customer:c.name,items:lines,total,status:'Pendiente',paymentStatus:o.paymentStatus,channel:o.channel,createdAt:new Date().toISOString(),notes:o.notes});c.stage='Cliente';break;
 }
 case 'order.status':{
  const d=z.object({orderId:id,status:z.enum(['Pendiente','Confirmado','Enviado','Entregado','Cancelado'])}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o)throw new DomainError('Pedido no encontrado.');
  const allowed:Record<string,string[]>={Pendiente:['Confirmado','Cancelado'],Confirmado:['Enviado','Cancelado'],Enviado:['Entregado'],Entregado:[],Cancelado:[]};
  if(o.status===d.status)return w;if(!allowed[o.status].includes(d.status))throw new DomainError('Ese cambio de estado no está permitido.');
  if(d.status==='Cancelado')for(const l of o.items){const p=s.products.find(p=>p.id===l.productId);if(p)p.stock+=l.quantity;}o.status=d.status;break;
 }
 case 'order.payment':{const d=z.object({orderId:id,paymentStatus:z.enum(['Pendiente','Pagado'])}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o||o.status==='Cancelado')throw new DomainError('No se puede modificar ese pedido.');o.paymentStatus=d.paymentStatus;break;}
 default:throw new DomainError('Acción no disponible.');
 }
 if(JSON.stringify(w).length>2500000)throw new DomainError('El espacio superó el tamaño permitido. Exporta los datos antes de continuar.');
 return w;
}
export function simulateReply(store:Store,text:string):string {
 const t=text.toLocaleLowerCase('es');
 if(/env[ií]o|entrega|delivery/.test(t))return store.agent.shipping||'Aún no hay una política de envíos configurada. Un asesor debe confirmar el costo y la cobertura.';
 if(/pago|yape|plin|tarjeta/.test(t))return store.agent.payments||'Aún no hay métodos de pago configurados. Consulta con un asesor antes de pagar.';
 if(/devol|cambio/.test(t))return store.agent.returns||'Un asesor debe confirmar la política de cambios y devoluciones.';
 for(const f of store.faqs.filter(f=>f.active)){if(f.title.toLowerCase().split(/\W+/).filter(x=>x.length>3).some(x=>t.includes(x)))return f.content;}
 const p=store.products.find(p=>p.active&&(t.includes(p.name.toLowerCase())||(p.sku&&t.includes(p.sku.toLowerCase()))));
 if(p)return p.stock>0?`${p.name}: S/ ${p.price.toFixed(2)}. Stock registrado: ${p.stock}. ${p.description}`:`${p.name} está agotado según el catálogo.`;
 if(/cat[aá]logo|producto|precio/.test(t)){const ps=store.products.filter(p=>p.active).slice(0,6);return ps.length?ps.map(p=>`${p.name} · S/ ${p.price.toFixed(2)} · ${p.stock>0?'Disponible':'Agotado'}`).join('\n'):'Tu catálogo aún está vacío. Agrega productos para probar esta respuesta.';}
 if(/hola|buenas|buenos/.test(t))return store.agent.greeting;
 return 'Esta prueba solo usa coincidencias con el catálogo y las preguntas frecuentes. Para responder libremente hay que conectar un modelo de IA. Un asesor debe atender esta consulta.';
}
