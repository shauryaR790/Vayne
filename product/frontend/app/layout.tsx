import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["600", "700"],
});

export const metadata = {
  title: "VAYNE — Analyst Workstation",
  description: "Attack path reasoning engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-vercel-bg font-sans antialiased text-vercel-text">
        {children}
      </body>
    </html>
  );
}
