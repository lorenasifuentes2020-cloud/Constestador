# Nexo — continuidad en Codex

Actualizado: 23 de octubre de 2026. Propietaria: Lorena Sifuentes.

## Proyecto existente
- URL: https://nexo-tiendas-lorena.regallime2.chatgpt.site/
- Proyecto Sites: appgprj_6ad237a1461481919a0687b66dd1d96b
- Checkout en este entorno: /workspace/Constestador. Esta ruta no existe automáticamente en el equipo de Lorena.
- Reutilizar .openai/hosting.json y la identidad del proyecto; no crear otro Site.
- React/Vinext y Cloudflare Workers; D1 DB para datos; R2 todavía deshabilitado.
- Leer la skill Sites y obtener credenciales de repositorio efímeras por su flujo oficial. No copiar tokens a documentos.
- El acceso del sitio leído el 16/10/2026 es público. Las rutas de datos requieren identidad ChatGPT y filtran por propietario. No cambiar la audiencia sin indicación.

## Producto y estado real
Panel para hasta cinco tiendas, con productos, stock, contactos, pedidos, métricas, configuración del vendedor, preguntas frecuentes y reglas separadas por tienda. Diseño de cristal translúcido, fondo cálido y acentos naranjas. Exportación de datos disponible.
El servidor impide crear una sexta tienda, incluso mediante carga de ejemplos. No se eliminan datos anteriores si ya hubiera más de cinco.
El apartado Equipo permite a la propietaria invitar hasta diez administradores mediante el correo exacto de su cuenta de ChatGPT. La invitación se activa al iniciar sesión y todos operan sobre el mismo conjunto de tiendas. Los administradores gestionan productos, clientes, pedidos y configuración, pero no pueden invitar o retirar miembros. Nexo no envía el correo de invitación: la propietaria comparte el enlace del sitio.
El apartado Equipo también muestra actividad reciente por integrante. El registro guarda descripciones breves y evita copiar el contenido de clientes o pedidos.
Los pedidos nuevos separan logística y pagos. Al crearlos se elige Lima o provincia y luego se registran manualmente los pagos verificados. Nexo calcula cobrado, saldo y muestra las etiquetas Pago pendiente/Pago parcial/Pago completado. Los pedidos anteriores marcados como pagados siguen siendo compatibles.
La exportación JSON incluye una versión de formato. La propietaria puede restaurar un respaldo completo después de revisar un resumen y escribir RESTAURAR. El servidor valida límites, duplicados, referencias entre registros, totales y abonos antes de reemplazar las tiendas. Los administradores pueden exportar, pero no restaurar todo el espacio.
El probador ya admite tres proveedores seleccionables por tienda: Gemini (`GEMINI_API_KEY`), Claude (`ANTHROPIC_API_KEY`) y ChatGPT mediante la API de OpenAI (`NEXO_OPENAI_API_KEY`). Envía catálogo activo, configuración de la tienda e historial breve; no envía clientes, pedidos ni pagos. Las claves viven solo como secretos del servidor.
La bandeja de conversaciones ya tiene almacenamiento normalizado, historial, estados abierta/esperando/cerrada, respuestas del equipo y transferencia entre atención humana e IA. Cada tienda puede activar un enlace de chat web público. Los visitantes reciben respuestas del proveedor elegido; si falta la clave o la IA falla, la conversación se conserva y pasa al equipo. El navegador consulta periódicamente las respuestas humanas. WhatsApp, Instagram y Messenger todavía no reciben ni envían mensajes reales; también siguen pendientes pagos externos y biblioteca documental.
Datos: workspaces(owner_id, payload JSON, version, updated_at), con control de versión para evitar sobrescrituras; workspace_members relaciona los administradores con el espacio de la propietaria; workspace_audit_log conserva actividad breve del equipo; conversations y conversation_messages guardan la bandeja sin mezclar espacios; public_store_channels controla enlaces públicos revocables. Antes de conectar canales a escala, añadir cola, idempotencia, límites distribuidos por origen y política de retención.

## Reglas comerciales confirmadas por Lorena
- Los pagos de Lima y provincias se registran manualmente; Nexo calcula el saldo y etiqueta el pago como pendiente, parcial o completado.
- El envío está incluido en el precio del pedido. Provincias se coordinan por Shalom y el motorizado cubre todo Lima.
- No asumir que Shalom recauda dinero, libera paquetes o verifica pagos por API.
- No inventar cuentas bancarias, billeteras, plazos, descuentos ni tarifas.
- Un comprobante enviado por el cliente no prueba por sí solo el pago.
- Los pagos y reembolsos se conservan como movimientos separados. El cobro neto, el saldo y el estado de pago se recalculan automáticamente. Todavía faltan comprobantes adjuntos. No marcar un movimiento como verificado sin comprobarlo fuera de Nexo.
- No mostrar ni inventar condiciones para cambios y devoluciones.

## Agentes deseados
Conversación natural, breve y contextual; recordar lo hablado y preguntar lo necesario. Biblioteca común de técnicas de venta y libros, junto con conocimiento específico por tienda. Recuperar fuentes relevantes, no afirmar que cargar documentos reentrena al modelo. Separar clientes por tienda; precios y stock siempre desde catálogo; aprobación humana para excepciones. No garantizar ventas ni fingir identidad humana.

## Modelos de IA y costes
Lorena decidió que cada tienda pueda elegir entre Gemini, Claude o ChatGPT. Los modelos son configurables desde el servidor; los valores iniciales son `gemini-3.1-pro-preview`, `claude-sonnet-4-6` y `gpt-5.4`. La disponibilidad, cuota y facturación dependen de cada cuenta y proveedor, por lo que deben validarse antes del piloto. Iniciar sesión con ChatGPT se usa para identidad y administración; no aporta cuota de la API de OpenAI ni de los otros proveedores.

## Siguientes pasos
1. Añadir comprobantes adjuntos cuando exista almacenamiento de archivos.
2. Añadir al menos una clave de IA, confirmar que el modelo elegido está habilitado y probar sus límites.
3. Automatizar copias periódicas y definir una política de retención antes de usar datos reales a escala.
4. Validar cuotas y facturación de cada proveedor que se vaya a habilitar antes del piloto.
5. Biblioteca con archivos, extracción y recuperación por tienda.
6. Publicar el chat web en una tienda piloto; medir calidad, derivaciones y conversiones antes de ampliar.

## Validación
Pruebas: npm test
TypeScript: node node_modules/typescript/bin/tsc --noEmit
Compilar/publicar mediante helpers Sites. No iniciar un navegador alternativo para QA si la skill no lo permite. No se ha realizado prueba de carga; no prometer capacidad de clientes simultáneos.
