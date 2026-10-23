import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChaveCheck · Vistoria assistida",
  description: "Converse, confira e registre. Uma prova de conceito de vistoria assistida por IA."
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
