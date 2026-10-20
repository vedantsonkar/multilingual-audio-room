import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = { title: "Common — one conversation, every language", description: "A private room for two. Speak naturally and listen in your own language with live audio translation." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f8f9f6" }, { media: "(prefers-color-scheme: dark)", color: "#151b17" }] };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}</ThemeProvider></body></html>; }
