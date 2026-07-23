import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata = {
  title: "VAYNE — Investigation Operating System",
  description:
    "Upload scanner evidence. VAYNE correlates, deduplicates, prioritizes, and generates investigations — then explains what the engines concluded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-vx-app font-sans antialiased text-vx-text">
        {children}
      </body>
    </html>
  );
}
