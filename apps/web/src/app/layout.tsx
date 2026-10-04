import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import { AuthProvider, MetaProvider } from "@/lib/auth";
import { LangProvider } from "@/lib/i18n";
import { ConfirmProvider, ToastProvider } from "@/components/ui";
import "./globals.css";

const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700", "800"], variable: "--font-tajawal" });

export const metadata: Metadata = {
  title: "Masar — Transport & Logistics",
  description: "Waybills, dispatch, live tracking, proof of delivery and billing for transport companies.",
};
export const viewport: Viewport = { themeColor: "#2aa57c", width: "device-width", initialScale: 1 };

const themeBoot = `try{var t=localStorage.getItem("masar-theme");if(!t)t="light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" className={tajawal.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <LangProvider>
          <AuthProvider>
            <MetaProvider>
              <ToastProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </ToastProvider>
            </MetaProvider>
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
