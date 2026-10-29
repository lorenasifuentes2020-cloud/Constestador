import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Política de privacidad · Nexo",
  description: "Política de privacidad de Nexo Ventas Habitos.",
};

export default function PrivacyPage() {
  return <main className={styles.page}>
    <article className={styles.article}>
      <div className={styles.brand}><span className={styles.mark}>N</span>Nexo</div>
      <h1>Política de privacidad</h1>
      <p className={styles.updated}>Última actualización: 29 de octubre de 2026</p>

      <section>
        <h2>Responsable y contacto</h2>
        <p>Nexo Ventas Habitos ofrece herramientas para que comercios administren ventas y atiendan conversaciones. Para consultas sobre privacidad, escribe a <a href="mailto:nicolchauca@gmail.com">nicolchauca@gmail.com</a>.</p>
      </section>

      <section>
        <h2>Datos que tratamos</h2>
        <ul>
          <li>Nombre, número de teléfono, identificadores técnicos y contenido de mensajes recibidos mediante WhatsApp o el chat web.</li>
          <li>Información que una persona decide compartir durante una conversación comercial.</li>
          <li>Datos de catálogo, clientes, pedidos y pagos registrados por los comercios que utilizan Nexo.</li>
          <li>Datos técnicos y de identidad necesarios para autenticar al equipo, proteger el servicio y diagnosticar errores.</li>
        </ul>
      </section>

      <section>
        <h2>Cómo usamos los datos</h2>
        <p>Usamos la información para entregar mensajes, responder consultas, mantener el historial de atención, administrar pedidos y brindar las funciones solicitadas por cada comercio. También la usamos para prevenir abuso, proteger las cuentas y mantener el funcionamiento del servicio.</p>
      </section>

      <section>
        <h2>Proveedores y transferencias</h2>
        <p>Nexo utiliza servicios de Meta para WhatsApp y de Cloudflare para alojamiento y almacenamiento. Cuando un comercio activa un proveedor de inteligencia artificial, el contenido comercial necesario para redactar una respuesta puede procesarse mediante ese proveedor. No vendemos datos personales.</p>
      </section>

      <section>
        <h2>Conservación y seguridad</h2>
        <p>Conservamos la información mientras sea necesaria para prestar el servicio, mantener la conversación o atender obligaciones aplicables. Aplicamos controles de acceso y medidas técnicas razonables. Ningún sistema conectado a Internet puede garantizar seguridad absoluta.</p>
      </section>

      <section>
        <h2>Derechos y eliminación</h2>
        <p>Puedes solicitar acceso, corrección o eliminación de tus datos escribiendo a <a href="mailto:nicolchauca@gmail.com">nicolchauca@gmail.com</a>. Podremos pedir información razonable para verificar tu identidad y localizar tus datos.</p>
      </section>

      <section>
        <h2>Cambios a esta política</h2>
        <p>Podemos actualizar esta política cuando cambien las funciones o requisitos aplicables. La fecha de la versión vigente aparece al inicio de esta página.</p>
      </section>

      <nav className={styles.links} aria-label="Información legal">
        <Link href="/eliminar-datos">Eliminación de datos</Link>
        <Link href="/terminos">Condiciones del servicio</Link>
      </nav>
    </article>
  </main>;
}
