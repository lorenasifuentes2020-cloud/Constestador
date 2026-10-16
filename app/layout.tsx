import type { Metadata } from "next";
import "./globals.css";
import "./glass.css";
export const metadata: Metadata = {title: "Nexo · Mis tiendas", description: "Tu centro privado de ventas. Gestiona todas tus tiendas, productos, clientes y pedidos desde un solo lugar.", icons: {icon: "/favicon.svg"}};
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="es"><body>{children}</body></html>;}
