import { z } from 'zod';
export type Product = {id:string;name:string;sku:string;category:string;price:number;stock:number;description:string;active:boolean};
export type Contact = {id:string;name:string;phone:string;email:string;stage:string;notes:string};
export type Payment = {id:string;amount:number;method:string;reference:string;createdAt:string};
export type Refund = Payment;
export type Order = {id:string;number:string;contactId:string;customer:string;items:{productId:string;name:string;quantity:number;price:number}[];total:number;status:string;paymentStatus:string;paymentPlan?:'province-advance'|'lima-cod';expectedAdvance?:number;payments?:Payment[];refunds?:Refund[];channel:string;createdAt:string;notes:string};
export type Entry = {id:string;title:string;content:string;active:boolean};
export type Agent = {name:string;tone:string;description:string;greeting:string;instructions:string;shipping:string;payments:string;provider:'gemini'|'anthropic'|'openai'};
export type Store = {id:string;name:string;category:string;color:string;createdAt:string;demo:boolean;products:Product[];contacts:Contact[];orders:Order[];faqs:Entry[];rules:Entry[];promotions:Entry[];agent:Agent;modules:{wholesale:boolean;advisors:boolean}};
export type Workspace = {stores:Store[]};
const str=(max=300)=>z.string().trim().max(max);
const required=(max=120)=>str(max).min(1,'Completa los campos obligatorios.');
const id=z.string().min(1).max(100);
const baseStore=z.object({name:required(80),category:required(80),color:z.enum(['plum','green','blue','orange'])});
const product=z.object({id:id.optional(),name:required(),sku:str(60),category:str(80),price:z.number().finite().min(0).max(1e7),stock:z.number().int().min(0).max(1e7),description:str(2000),active:z.boolean()});
const contact=z.object({id:id.optional(),name:required(),phone:str(30),email:z.union([z.literal(''),z.string().email()]).default(''),stage:z.enum(['Nuevo','En conversación','Cliente','Inactivo']),notes:str(2000)});
const entry=z.object({id:id.optional(),title:required(200),content:required(4000),active:z.boolean()});
const agent=z.object({name:required(80),tone:z.enum(['Cercano','Profesional','Entusiasta']),description:str(4000),greeting:str(1000),instructions:str(8000),shipping:str(3000),payments:str(3000),provider:z.enum(['gemini','anthropic','openai']).default('gemini')});
const paymentMethod=z.enum(['Efectivo','Yape','Plin','Transferencia','Tarjeta','Otro']);
const timestamp=z.string().datetime({offset:true});
const storedProduct=product.extend({id});
const storedContact=contact.extend({id});
const storedEntry=entry.extend({id});
const storedPayment=z.object({id,amount:z.number().finite().min(0.01).max(1e7),method:paymentMethod,reference:str(120),createdAt:timestamp});
const storedOrder=z.object({
 id,number:required(40),contactId:id,customer:required(),
 items:z.array(z.object({productId:id,name:required(),quantity:z.number().int().min(1).max(10000),price:z.number().finite().min(0).max(1e7)})).min(1).max(50),
 total:z.number().finite().min(0).max(1e9),status:z.enum(['Pendiente','Confirmado','Enviado','Entregado','Cancelado']),paymentStatus:z.enum(['Pendiente','Parcial','Pagado']),
 paymentPlan:z.enum(['province-advance','lima-cod']).optional(),expectedAdvance:z.number().finite().min(0).max(1e9).optional(),payments:z.array(storedPayment).max(1500).optional(),refunds:z.array(storedPayment).max(1500).optional(),
 channel:z.enum(['Manual','WhatsApp','Instagram','Web']),createdAt:timestamp,notes:str(2000),
});
const storedStore=baseStore.extend({
 id,createdAt:timestamp,demo:z.boolean(),products:z.array(storedProduct).max(1500),contacts:z.array(storedContact).max(1500),orders:z.array(storedOrder).max(1500),
 faqs:z.array(storedEntry).max(1500),rules:z.array(storedEntry).max(1500),promotions:z.array(storedEntry).max(1500),agent,modules:z.object({wholesale:z.boolean(),advisors:z.boolean()}),
});
const backupDocument=z.object({formatVersion:z.literal(1).optional(),exportedAt:timestamp.optional(),stores:z.array(storedStore).max(5)});
export const DEFAULT_PAYMENTS='Los pagos de Lima y provincias se registran manualmente después de verificarlos. Nexo muestra si el pago está pendiente, parcial o completado y calcula el saldo restante. No afirmar que un pago está completo sin revisar los movimientos registrados.';
export const DEFAULT_SHIPPING='El envío está incluido en el precio del pedido. Para provincias del Perú se coordina el despacho por Shalom. Para Lima, el motorizado cubre todo Lima. Confirmar únicamente el plazo y los datos necesarios para la entrega.';
const LEGACY_PAYMENTS='Provincias fuera de Lima: adelanto del 50% del valor de los productos, envío por Shalom y pago posterior del saldo. Lima: opción de pago al recibir en casa con el motorizado. Confirmar con la tienda el momento exacto del saldo y los costos de envío. Un adelanto no es un pago completo.';
const LEGACY_SHIPPING='Provincias fuera de Lima: envío por Shalom después del adelanto del 50% del valor de los productos. Lima: entrega a domicilio con motorizado y opción de pago al recibir. Confirmar cobertura, tarifa y plazos con la tienda.';
const uid=()=>crypto.randomUUID();
export function createStore(input:z.infer<typeof baseStore>,demo=false):Store{return {id:uid(),...input,createdAt:new Date().toISOString(),demo,products:[],contacts:[],orders:[],faqs:[],rules:[],promotions:[],agent:{name:'Asistente de '+input.name,tone:'Cercano',description:'',greeting:'¡Hola! Bienvenido a '+input.name+'. ¿En qué puedo ayudarte?',instructions:'No inventes precios ni disponibilidad. Consulta el catálogo y deriva a una persona cuando no tengas información suficiente.',shipping:DEFAULT_SHIPPING,payments:DEFAULT_PAYMENTS,provider:'gemini'},modules:{wholesale:false,advisors:false}};}
export class DomainError extends Error {status=400;}
export function normalizeWorkspace(input:Workspace):Workspace {const workspace=structuredClone(input);for(const store of workspace.stores){if(!['gemini','anthropic','openai'].includes(store.agent.provider))store.agent.provider='gemini';if(store.agent.payments===LEGACY_PAYMENTS)store.agent.payments=DEFAULT_PAYMENTS;if(store.agent.shipping===LEGACY_SHIPPING||store.agent.shipping==='Envíos de ejemplo a Lima y provincias. Confirmar cobertura y costo antes de cerrar el pedido.')store.agent.shipping=DEFAULT_SHIPPING;delete (store.agent as Agent&{returns?:string}).returns;}return workspace;}
export function parseWorkspaceBackup(input:unknown):Workspace {
 const parsed=backupDocument.safeParse(input);if(!parsed.success)throw new DomainError('El archivo no tiene un formato de respaldo válido de Nexo.');
 const workspace:Workspace={stores:parsed.data.stores};const storeIds=new Set<string>();
 for(const store of workspace.stores){
  if(storeIds.has(store.id))throw new DomainError('El respaldo contiene tiendas duplicadas.');storeIds.add(store.id);
  assertUnique(store.products,'productos');assertUnique(store.contacts,'clientes');assertUnique(store.orders,'pedidos');assertUnique(store.faqs,'preguntas frecuentes');assertUnique(store.rules,'reglas');assertUnique(store.promotions,'promociones');
  const productIds=new Set(store.products.map(item=>item.id));const contactIds=new Set(store.contacts.map(item=>item.id));
  for(const order of store.orders){
   if(!contactIds.has(order.contactId))throw new DomainError(`El pedido ${order.number} refiere a un cliente inexistente.`);
   if(order.items.some(item=>!productIds.has(item.productId)))throw new DomainError(`El pedido ${order.number} refiere a un producto inexistente.`);
   if(money(order.items.reduce((sum,item)=>sum+item.price*item.quantity,0))!==money(order.total))throw new DomainError(`El total del pedido ${order.number} no coincide con sus productos.`);
   if(order.expectedAdvance!==undefined&&money(order.expectedAdvance)>money(order.total))throw new DomainError(`El adelanto del pedido ${order.number} supera su total.`);
   if(order.payments){assertUnique(order.payments,'abonos');assertUnique(order.refunds||[],'reembolsos');const gross=money(order.payments.reduce((sum,payment)=>sum+payment.amount,0));const refunded=money((order.refunds||[]).reduce((sum,refund)=>sum+refund.amount,0));if(refunded>gross)throw new DomainError(`Los reembolsos del pedido ${order.number} superan lo cobrado.`);const paid=money(gross-refunded);if(paid>money(order.total))throw new DomainError(`El cobro neto del pedido ${order.number} supera su total.`);const expected=paid<=0?'Pendiente':paid>=order.total?'Pagado':'Parcial';if(order.paymentStatus!==expected)throw new DomainError(`El estado de pago del pedido ${order.number} no coincide con sus movimientos.`);}
   else if(order.refunds?.length)throw new DomainError(`El pedido ${order.number} tiene reembolsos sin abonos detallados.`);
  }
 }
 if(JSON.stringify(workspace).length>2500000)throw new DomainError('El respaldo supera el tamaño permitido.');return normalizeWorkspace(workspace);
}
export function mutateWorkspace(current:Workspace,type:string,payload:any):Workspace {
 const w=normalizeWorkspace(current);
 if(type==='workspace.import')return parseWorkspaceBackup(payload?.backup);
 if(type==='store.create'){if(w.stores.length>=5)throw new DomainError('Límite de 5 tiendas alcanzado.');w.stores.push(createStore(baseStore.parse(payload)));return w;}
 if(type==='demo.load'){
  if(w.stores.some(s=>s.demo))throw new DomainError('Ya tienes tiendas de ejemplo.');
  if(w.stores.length>2)throw new DomainError('No hay espacio para tres tiendas de ejemplo.');
  for(const [n,c,col,items] of [
   ['Luna Studio','Moda y accesorios','plum',[['Blusa Alba','BL-001',89,24],['Bolso Arena','BO-001',139,12],['Vestido Aurora','VE-001',159,8]]],
   ['Nativa Beauty','Belleza y cuidado','green',[['Sérum Botánico','SE-001',69,32],['Crema Hidratante','CR-001',49,18]]],
   ['Casa Nube','Hogar y decoración','orange',[['Lámpara Nube','LA-001',189,5],['Jarrón Tierra','JA-001',79,14]]]
  ] as any[]){const s=createStore({name:n,category:c,color:col},true);s.products=items.map((x:any)=>({id:uid(),name:x[0],sku:x[1],price:x[2],stock:x[3],category:c,description:'Producto de ejemplo para explorar el sistema.',active:true}));s.contacts=[{id:uid(),name:'Cliente de ejemplo',phone:'',email:'',stage:'Nuevo',notes:'Datos ficticios. Puedes crear tus propios contactos.'}];w.stores.push(s);}
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
  const o=z.object({contactId:id,items:z.array(z.object({productId:id,quantity:z.number().int().min(1).max(10000)})).min(1).max(50),channel:z.enum(['Manual','WhatsApp','Instagram','Web']),notes:str(2000),paymentPlan:z.enum(['province-advance','lima-cod'])}).parse(payload);
  const c=s.contacts.find(c=>c.id===o.contactId);if(!c)throw new DomainError('Selecciona un cliente de esta tienda.');
  const quantities=new Map<string,number>();o.items.forEach(x=>quantities.set(x.productId,(quantities.get(x.productId)||0)+x.quantity));
  const lines=Array.from(quantities,([productId,quantity])=>{const p=s.products.find(p=>p.id===productId&&p.active);if(!p)throw new DomainError('Producto no disponible en esta tienda.');if(p.stock<quantity)throw new DomainError('Stock insuficiente para '+p.name+'.');return {productId,name:p.name,quantity,price:p.price};});
  for(const l of lines)s.products.find(p=>p.id===l.productId)!.stock-=l.quantity;
  const total=Math.round(lines.reduce((a,l)=>a+l.price*l.quantity,0)*100)/100;
  s.orders.unshift({id:uid(),number:'NX-'+String(s.orders.length+1).padStart(4,'0'),contactId:c.id,customer:c.name,items:lines,total,status:'Pendiente',paymentStatus:'Pendiente',paymentPlan:o.paymentPlan,payments:[],refunds:[],channel:o.channel,createdAt:new Date().toISOString(),notes:o.notes});c.stage='Cliente';break;
 }
 case 'order.status':{
  const d=z.object({orderId:id,status:z.enum(['Pendiente','Confirmado','Enviado','Entregado','Cancelado'])}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o)throw new DomainError('Pedido no encontrado.');
  const allowed:Record<string,string[]>={Pendiente:['Confirmado','Cancelado'],Confirmado:['Enviado','Cancelado'],Enviado:['Entregado'],Entregado:[],Cancelado:[]};
  if(o.status===d.status)return w;if(!allowed[o.status].includes(d.status))throw new DomainError('Ese cambio de estado no está permitido.');
  if(d.status==='Cancelado')for(const l of o.items){const p=s.products.find(p=>p.id===l.productId);if(p)p.stock+=l.quantity;}o.status=d.status;break;
 }
 case 'order.payment.add':{
  const d=z.object({orderId:id,amount:z.number().finite().min(0.01).max(1e7),method:paymentMethod,reference:str(120)}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o||o.status==='Cancelado')throw new DomainError('No se puede registrar un abono en ese pedido.');
  if(!o.payments&&o.paymentStatus==='Pagado')throw new DomainError('Este pedido ya figura como pagado en el registro anterior.');
  o.payments??=[];o.refunds??=[];const amount=money(d.amount);const remaining=money(o.total-netPaid(o));if(amount>remaining)throw new DomainError('El abono supera el saldo pendiente.');
  o.payments.unshift({id:uid(),amount,method:d.method,reference:d.reference,createdAt:new Date().toISOString()});updatePaymentStatus(o);break;
 }
 case 'order.payment.remove':{
  const d=z.object({orderId:id,paymentId:id}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o||!o.payments)throw new DomainError('Abono no encontrado.');const index=o.payments.findIndex(p=>p.id===d.paymentId);if(index<0)throw new DomainError('Abono no encontrado.');const nextGross=money(o.payments.reduce((sum,p)=>sum+p.amount,0)-o.payments[index].amount);const refunded=money((o.refunds||[]).reduce((sum,r)=>sum+r.amount,0));if(refunded>nextGross)throw new DomainError('Primero elimina o corrige los reembolsos asociados.');o.payments.splice(index,1);updatePaymentStatus(o);break;
 }
 case 'order.refund.add':{
  const d=z.object({orderId:id,amount:z.number().finite().min(0.01).max(1e7),method:paymentMethod,reference:str(120)}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o||!o.payments?.length)throw new DomainError('No hay abonos detallados que se puedan reembolsar.');o.refunds??=[];const amount=money(d.amount);if(amount>netPaid(o))throw new DomainError('El reembolso supera el cobro neto disponible.');o.refunds.unshift({id:uid(),amount,method:d.method,reference:d.reference,createdAt:new Date().toISOString()});updatePaymentStatus(o);break;
 }
 case 'order.refund.remove':{
  const d=z.object({orderId:id,refundId:id}).parse(payload);const o=s.orders.find(o=>o.id===d.orderId);if(!o||!o.refunds)throw new DomainError('Reembolso no encontrado.');const index=o.refunds.findIndex(r=>r.id===d.refundId);if(index<0)throw new DomainError('Reembolso no encontrado.');const nextRefunded=money(o.refunds.reduce((sum,r)=>sum+r.amount,0)-o.refunds[index].amount);const gross=money((o.payments||[]).reduce((sum,p)=>sum+p.amount,0));if(money(gross-nextRefunded)>money(o.total))throw new DomainError('No se puede eliminar: el cobro neto superaría el total del pedido.');o.refunds.splice(index,1);updatePaymentStatus(o);break;
 }
 default:throw new DomainError('Acción no disponible.');
 }
 if(JSON.stringify(w).length>2500000)throw new DomainError('El espacio superó el tamaño permitido. Exporta los datos antes de continuar.');
 return w;
}
function money(value:number){return Math.round((value+Number.EPSILON)*100)/100;}
function assertUnique(items:{id:string}[],label:string){if(new Set(items.map(item=>item.id)).size!==items.length)throw new DomainError(`El respaldo contiene ${label} duplicados.`);}
function netPaid(order:Order){return money((order.payments||[]).reduce((sum,p)=>sum+p.amount,0)-(order.refunds||[]).reduce((sum,r)=>sum+r.amount,0));}
function updatePaymentStatus(order:Order){const paid=netPaid(order);order.paymentStatus=paid<=0?'Pendiente':paid>=order.total?'Pagado':'Parcial';}
