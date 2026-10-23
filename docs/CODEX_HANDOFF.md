# Nexo — continuidad en Codex

Actualizado: 23 de octubre de 2026. Propietaria: Lorena Sifuentes.

## Proyecto existente
- URL: https://nexo-tiendas-lorena.regallime2.chatgpt.site/
- Proyecto Sites: appgprj_6ad237a1461481919a0687b66dd1d96b
- Checkout en este entorno: /workspace/Constestador. Esta ruta no existe automáticamente en el equipo de Lorena.
- Reutilizar .openai/hosting.json y la identidad del proyecto; no crear otro Site.
- React/Vinext y Cloudflare Workers; D1 DB para datos y R2 para comprobantes adjuntos.
- Leer la skill Sites y obtener credenciales de repositorio efímeras por su flujo oficial. No copiar tokens a documentos.
- El acceso del sitio leído el 16/10/2026 es público. Las rutas de datos requieren identidad ChatGPT y filtran por propietario. No cambiar la audiencia sin indicación.

## Producto y estado real
Panel para hasta cinco tiendas, con productos, stock, contactos, pedidos, métricas, configuración del vendedor, preguntas frecuentes y reglas separadas por tienda. Diseño de cristal translúcido, fondo cálido y acentos naranjas. Exportación de datos disponible.
Cada producto admite descripción, características, beneficios, cliente ideal, variantes y argumentos comerciales. Los tres proveedores reciben únicamente los productos activos con su precio y stock actuales.
El servidor impide crear una sexta tienda, incluso mediante carga de ejemplos. No se eliminan datos anteriores si ya hubiera más de cinco.
El apartado Equipo permite a la propietaria invitar hasta diez administradores mediante el correo exacto de su cuenta de ChatGPT. La invitación se activa al iniciar sesión y todos operan sobre el mismo conjunto de tiendas. Los administradores gestionan productos, clientes, pedidos y configuración, pero no pueden invitar o retirar miembros. Nexo no envía el correo de invitación: la propietaria comparte el enlace del sitio.
El apartado Equipo también muestra actividad reciente por integrante. El registro guarda descripciones breves y evita copiar el contenido de clientes o pedidos.
Los pedidos nuevos separan logística y pagos. Al crearlos se elige Lima o provincia y luego se registran manualmente los pagos verificados. Nexo calcula cobrado, saldo y muestra las etiquetas Pago pendiente/Pago parcial/Pago completado. Los pedidos anteriores marcados como pagados siguen siendo compatibles. Cada pago puede conservar comprobantes JPG, PNG, WebP o PDF de hasta 5 MB en R2; ver o descargar exige pertenecer al espacio. Adjuntar un archivo no verifica el pago automáticamente.
La exportación JSON incluye una versión de formato. La propietaria puede restaurar un respaldo completo después de revisar un resumen y escribir RESTAURAR. El servidor valida límites, duplicados, referencias entre registros, totales y abonos antes de reemplazar las tiendas. Los administradores pueden exportar, pero no restaurar todo el espacio.
Nexo conserva además hasta diez puntos de recuperación dentro de D1. Antes de cada cambio guarda la versión anterior si es distinta; la propietaria puede crear un punto manual y restaurarlo desde Configuración. Antes de una restauración se protege otra vez el estado vigente, de modo que la operación sea reversible. Estos puntos cubren tiendas, catálogo, contactos, pedidos y configuración; las conversaciones viven en tablas separadas.
El probador ya admite tres proveedores seleccionables por tienda: Gemini (`GEMINI_API_KEY`), Claude (`ANTHROPIC_API_KEY`) y ChatGPT mediante la API de OpenAI (`NEXO_OPENAI_API_KEY`). Envía catálogo activo, configuración de la tienda e historial breve; no envía clientes, pedidos ni pagos. Las claves viven solo como secretos del servidor.
Cada tienda tiene además un guion de ventas configurable: objetivo, preguntas de diagnóstico, manejo de objeciones e instrucciones de cierre. La biblioteca acepta hasta treinta PDF/TXT/Markdown de 20 MB por tienda, conserva el original en R2, extrae el texto y recupera hasta cinco fragmentos relacionados con cada consulta. Los PDF escaneados como imágenes requieren OCR previo. La biblioteca orienta la conversación, pero el catálogo y las reglas de la tienda tienen prioridad.
La bandeja de conversaciones ya tiene almacenamiento normalizado, historial, estados abierta/esperando/cerrada, respuestas del equipo y transferencia entre atención humana e IA. Cada tienda puede activar un enlace de chat web público. Los visitantes reciben respuestas del proveedor elegido; si falta la clave o la IA falla, la conversación se conserva y pasa al equipo. El navegador consulta periódicamente las respuestas humanas.
WhatsApp Cloud API está implementado por tienda. La pantalla Canales muestra el webhook y permite asociar el Phone Number ID y WABA ID; los secretos `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` viven únicamente en el servidor. El webhook valida la firma de Meta, deduplica eventos, guarda la conversación, consulta el catálogo y la biblioteca, responde con el proveedor elegido y deriva archivos o fallos al equipo. Las respuestas humanas desde la bandeja se envían por Graph API. Falta guardar credenciales reales, configurar el webhook en Meta y completar una prueba de extremo a extremo con el número de producción. Instagram y Messenger siguen pendientes.
Datos: workspaces(owner_id, payload JSON, version, updated_at), con control de versión para evitar sobrescrituras; workspace_members relaciona los administradores con el espacio de la propietaria; workspace_audit_log conserva actividad breve del equipo; conversations y conversation_messages guardan la bandeja sin mezclar espacios; public_store_channels controla enlaces públicos revocables; whatsapp_channels asocia números con tiendas y whatsapp_events deduplica webhooks; workspace_snapshots conserva hasta diez versiones recuperables. Antes de usar canales a escala, añadir una cola de procesamiento, límites distribuidos por origen y política de retención.

## Reglas comerciales confirmadas por Lorena
- Los pagos de Lima y provincias se registran manualmente; Nexo calcula el saldo y etiqueta el pago como pendiente, parcial o completado.
- El envío está incluido en el precio del pedido. Provincias se coordinan por Shalom y el motorizado cubre todo Lima.
- No asumir que Shalom recauda dinero, libera paquetes o verifica pagos por API.
- No inventar cuentas bancarias, billeteras, plazos, descuentos ni tarifas.
- Un comprobante enviado por el cliente no prueba por sí solo el pago. Nexo permite adjuntarlo como respaldo protegido después de registrar el pago.
- Los pagos y reembolsos se conservan como movimientos separados. El cobro neto, el saldo y el estado de pago se recalculan automáticamente. No marcar un movimiento como verificado sin comprobarlo fuera de Nexo.
- No mostrar ni inventar condiciones para cambios y devoluciones.

## Agentes deseados
Conversación natural, breve y contextual; recordar lo hablado y preguntar lo necesario. Biblioteca común de técnicas de venta y libros, junto con conocimiento específico por tienda. Recuperar fuentes relevantes, no afirmar que cargar documentos reentrena al modelo. Separar clientes por tienda; precios y stock siempre desde catálogo; aprobación humana para excepciones. No garantizar ventas ni fingir identidad humana.

## Modelos de IA y costes
Lorena decidió que cada tienda pueda elegir entre Gemini, Claude o ChatGPT. Los modelos son configurables desde el servidor; los valores iniciales son `gemini-3.1-pro-preview`, `claude-sonnet-4-6` y `gpt-5.4`. La disponibilidad, cuota y facturación dependen de cada cuenta y proveedor, por lo que deben validarse antes del piloto. Iniciar sesión con ChatGPT se usa para identidad y administración; no aporta cuota de la API de OpenAI ni de los otros proveedores.

## Siguientes pasos
1. Confirmar que el modelo de Gemini elegido está habilitado y probar sus límites en el Site publicado.
2. Automatizar copias periódicas y definir una política de retención antes de usar datos reales a escala.
3. Validar cuotas y facturación de cada proveedor que se vaya a habilitar antes del piloto.
4. Medir resultados por conversación: intención, derivación y pedido creado.
5. Publicar el chat web y conectar WhatsApp en una tienda piloto; medir calidad, derivaciones y conversiones antes de ampliar.

Los respaldos JSON y los puntos de recuperación no contienen archivos R2. Una restauración se permite si conserva las tiendas, pagos y referencias de los documentos/comprobantes existentes; Nexo bloquea restauraciones que dejarían archivos huérfanos.

## Validación
Pruebas: npm test
TypeScript: node node_modules/typescript/bin/tsc --noEmit
Compilar/publicar mediante helpers Sites. No iniciar un navegador alternativo para QA si la skill no lo permite. No se ha realizado prueba de carga; no prometer capacidad de clientes simultáneos.
