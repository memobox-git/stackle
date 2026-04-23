import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Stackle — Career Advisor for Data & AI",
  description: "Your AI career advisor for data, analytics, and AI roles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col">{children}</body>
    </html>
  );
}
