import type { Metadata } from "next";
import { Barlow_Condensed, Nunito } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({
  variable: "--font-display",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-body",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Find the Imposter",
  description: "Realtime social deduction game with colorful detective-style interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
