import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Condiciones del servicio · Nexo",
  description: "Condiciones del servicio de Nexo Ventas Habitos.",
};

export default function TermsPage() {
  return <main className={styles.page}>
    <article className={styles.article}>
      <div className={styles.brand}><span className={styles.mark}>N</span>Nexo</div>
      <h1>Condiciones del servicio</h1>
      <p className={styles.updated}>Última actualización: 29 de octubre de 2026</p>

      <section>
        <h2>Uso de Nexo</h2>
        <p>Nexo ofrece herramientas para administrar catálogos, conversaciones, pedidos y atención comercial. Quien administra una tienda es responsable de la exactitud de su catálogo, precios, inventario, políticas y comunicaciones.</p>
      </section>

      <section>
        <h2>Mensajes y automatización</h2>
        <p>Las respuestas automáticas sirven como apoyo comercial y pueden requerir revisión humana. Los comercios deben respetar las políticas de WhatsApp, obtener los consentimientos necesarios y evitar mensajes engañosos, ilegales o no solicitados.</p>
      </section>

      <section>
        <h2>Pedidos y pagos</h2>
        <p>Nexo registra información operativa, pero no verifica por sí mismo transferencias, comprobantes ni entregas. Cada comercio es responsable de confirmar pagos y cumplir sus compromisos con sus clientes.</p>
      </section>

      <section>
        <h2>Disponibilidad y cambios</h2>
        <p>Podemos corregir, actualizar o suspender funciones para mantener la seguridad y operación del servicio. No garantizamos que el servicio esté disponible sin interrupciones.</p>
      </section>

      <section>
        <h2>Contacto</h2>
        <p>Para consultas sobre estas condiciones, escribe a <a href="mailto:nicolchauca@gmail.com">nicolchauca@gmail.com</a>.</p>
      </section>

      <nav className={styles.links} aria-label="Información legal">
        <Link href="/privacidad">Política de privacidad</Link>
        <Link href="/eliminar-datos">Eliminación de datos</Link>
      </nav>
    </article>
  </main>;
}
