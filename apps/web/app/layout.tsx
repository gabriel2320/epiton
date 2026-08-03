import type { Metadata } from "next";
import "../src/styles/tailwind.css";
import "../src/styles/app.css";
import { PwaRegistration } from "./PwaRegistration";

export const metadata: Metadata = {
  title: "Epiton",
  description: "Modern multiplatform Tryton-compatible client",
  icons: { icon: "/epiton.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
