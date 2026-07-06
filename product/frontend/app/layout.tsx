import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata = {
  title: "VANE — Attack Investigation Engine",
  description: "Upload evidence. Get the complete investigation.",
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
