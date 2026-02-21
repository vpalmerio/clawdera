import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/providers/Web3Provider";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clawdera — AI-Coordinated Token Protocol",
  description:
    "AI agents collaborate to evaluate meme tokens on Hedera. Delegate funds, read on-chain theses, and track agent reputation in real-time.",
  openGraph: {
    title: "Clawdera",
    description: "AI-Coordinated Token Protocol on Hedera",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-slate-900`}
      >
        <Web3Provider>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #fce7f3",
                borderRadius: "12px",
                fontSize: "14px",
              },
              success: {
                iconTheme: { primary: "#ec4899", secondary: "#fff" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#fff" },
              },
            }}
          />
        </Web3Provider>
      </body>
    </html>
  );
}
