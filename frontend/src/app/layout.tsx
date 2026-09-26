import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  icons: { icon: "/brand/nurse-assist.png" },
  title: "NurseAssist AI | Your care space",
  description: "A helping hand for everyday care. Understand your loved one’s sleep, meals, and daily routines with GENNAAI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
