import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = {
  title: "Eliminación de datos · Nexo",
  description: "Instrucciones para solicitar la eliminación de datos en Nexo.",
};

export default function DataDeletionPage() {
  return <main className={styles.page}>
    <article className={styles.article}>
      <div className={styles.brand}><span className={styles.mark}>N</span>Nexo</div>
      <h1>Solicitud de eliminación de datos</h1>
      <p className={styles.updated}>Última actualización: 29 de octubre de 2026</p>

      <section>
        <h2>Cómo solicitarla</h2>
        <ol>
          <li>Envía un correo a <a href="mailto:nicolchauca@gmail.com?subject=Eliminaci%C3%B3n%20de%20datos%20de%20Nexo">nicolchauca@gmail.com</a> con el asunto “Eliminación de datos de Nexo”.</li>
          <li>Indica el número de WhatsApp usado, con código de país, y el nombre de la tienda con la que conversaste.</li>
          <li>Describe si deseas eliminar una conversación concreta o todos los datos asociados.</li>
        </ol>
      </section>

      <section>
        <h2>Verificación y alcance</h2>
        <p>Para proteger tus datos, podremos pedir una confirmación razonable de identidad. Una vez verificada la solicitud, eliminaremos o anonimizaremos los datos localizados, salvo aquellos que debamos conservar por obligaciones legales, prevención de fraude o resolución de disputas.</p>
      </section>

      <section>
        <h2>Confirmación</h2>
        <p>Responderemos al correo de la solicitud para confirmar su recepción y, posteriormente, el resultado de la eliminación.</p>
      </section>

      <nav className={styles.links} aria-label="Información legal">
        <Link href="/privacidad">Política de privacidad</Link>
        <Link href="/terminos">Condiciones del servicio</Link>
      </nav>
    </article>
  </main>;
}
