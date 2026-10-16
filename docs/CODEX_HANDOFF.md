# Nexo — continuidad en Codex

Actualizado: 16 de octubre de 2026. Propietaria: Lorena Sifuentes.

## Proyecto existente
- URL: https://nexo-tiendas-lorena.regallime2.chatgpt.site/
- Proyecto Sites: appgprj_6ad237a1461481919a0687b66dd1d96b
- Checkout en este entorno: /workspace/sites/nexo-tiendas. Esta ruta no existe automáticamente en el equipo de Lorena.
- Reutilizar .openai/hosting.json y la identidad del proyecto; no crear otro Site.
- React/Vinext y Cloudflare Workers; D1 DB para datos; R2 todavía deshabilitado.
- Leer la skill Sites y obtener credenciales de repositorio efímeras por su flujo oficial. No copiar tokens a documentos.
- El acceso del sitio leído el 16/10/2026 es público. Las rutas de datos requieren identidad ChatGPT y filtran por propietario. No cambiar la audiencia sin indicación.

## Producto y estado real
Panel para hasta cinco tiendas, con productos, stock, contactos, pedidos, métricas, configuración del vendedor, preguntas frecuentes y reglas separadas por tienda. Diseño de cristal translúcido, fondo cálido y acentos naranjas. Exportación de datos disponible.
El servidor impide crear una sexta tienda, incluso mediante carga de ejemplos. No se eliminan datos anteriores si ya hubiera más de cinco.
El apartado Equipo permite a la propietaria invitar hasta diez administradores mediante el correo exacto de su cuenta de ChatGPT. La invitación se activa al iniciar sesión y todos operan sobre el mismo conjunto de tiendas. Los administradores gestionan productos, clientes, pedidos y configuración, pero no pueden invitar o retirar miembros. Nexo no envía el correo de invitación: la propietaria comparte el enlace del sitio.
El apartado Equipo también muestra actividad reciente por integrante. El registro guarda descripciones breves y evita copiar el contenido de clientes o pedidos.
Los pedidos nuevos separan logística y pagos. Al crearlos se elige provincia con adelanto esperado del 50% o Lima con pago al recibir. Los abonos se registran manualmente después de verificarlos; Nexo calcula cobrado, saldo y estado Pendiente/Parcial/Pagado. Los pedidos anteriores marcados como pagados siguen siendo compatibles.
El probador es una simulación por coincidencias, no una IA. WhatsApp, Instagram, Messenger, chat web, pagos externos y biblioteca documental NO están integrados.
Datos: workspaces(owner_id, payload JSON, version, updated_at), con control de versión para evitar sobrescrituras; workspace_members relaciona los administradores con el espacio de la propietaria. Antes de escalar conversaciones, normalizar tablas y añadir cola, auditoría e idempotencia.

## Reglas comerciales confirmadas por Lorena
- Provincias del Perú fuera de Lima: adelanto del 50% del valor de los productos; luego envío por Shalom; el cliente completa el saldo posteriormente.
- Lima: ofrecer pago al recibir el producto en casa con el motorizado.
- No asumir que Shalom recauda dinero, libera paquetes o verifica pagos por API.
- Falta confirmar cuándo se exige exactamente el saldo provincial, quién paga envío y cobertura de Lima/Callao.
- No inventar cuentas bancarias, billeteras, plazos, descuentos ni tarifas.
- Un adelanto no equivale a pago completo. Un comprobante enviado por el cliente no prueba por sí solo el abono.
- Los abonos y el saldo ya se registran por separado. Todavía faltan devoluciones o reembolsos y comprobantes adjuntos. No marcar un abono como verificado sin comprobarlo fuera de Nexo.

## Agentes deseados
Conversación natural, breve y contextual; recordar lo hablado y preguntar lo necesario. Biblioteca común de técnicas de venta y libros, junto con conocimiento específico por tienda. Recuperar fuentes relevantes, no afirmar que cargar documentos reentrena al modelo. Separar clientes por tienda; precios y stock siempre desde catálogo; aprobación humana para excepciones. No garantizar ventas ni fingir identidad humana.

## Restricción de costes
Lorena NO quiere usar la API de ChatGPT/OpenAI. No conectar proveedores facturados ni configurar pagos sin nueva instrucción. Puede usar Codex con su suscripción y sus límites. La documentación oficial de octubre de 2026 también contempla uso del plan en aplicaciones participantes; Nexo no tiene esa integración ni elegibilidad verificada. Iniciar sesión con ChatGPT no implica compartir el cupo del plan. No usar cookies/tokens de sesión como una API improvisada.
Referencias: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan y https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites

## Siguientes pasos
1. Aclarar momento de cobro del saldo, costo de envío y cobertura.
2. Añadir correcciones por devolución o reembolso y, cuando exista almacenamiento de archivos, comprobantes adjuntos.
3. Permitir importar una copia JSON, crear copias y probar recuperación antes de usar datos reales a escala.
4. Elegir vía de IA compatible con la restricción de costes; empezar por asistencia supervisada si no hay integración autorizada del plan.
5. Biblioteca con archivos, extracción y recuperación por tienda.
6. Un canal y una tienda piloto; medir calidad, derivaciones y conversiones antes de ampliar.

## Validación
Pruebas: npm test
TypeScript: node node_modules/typescript/bin/tsc --noEmit
Compilar/publicar mediante helpers Sites. No iniciar un navegador alternativo para QA si la skill no lo permite. No se ha realizado prueba de carga; no prometer capacidad de clientes simultáneos.
