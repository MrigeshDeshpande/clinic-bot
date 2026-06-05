import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { validateEnv } from "@/lib/envValidate";

if (typeof globalThis !== 'undefined' && !globalThis._envValidated) {
  try {
    validateEnv();
    globalThis._envValidated = true;
  } catch (e) {
    console.error('ENV VALIDATION FAILED:', e.message);
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Clinic Dashboard",
  description: "Clinic management dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
