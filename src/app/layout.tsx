import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { UiThemeProvider } from "@/components/ui/theme-provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Cortex UI",
  description: "Modular chat interface for CortexLTM-backed memory."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const key = "cortex-ui-skin";
    const raw = window.localStorage.getItem(key);
    const next = raw === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-ui-skin", next);
    document.documentElement.setAttribute("data-ui-ready", "1");
  } catch (_) {
    document.documentElement.setAttribute("data-ui-skin", "dark");
    document.documentElement.setAttribute("data-ui-ready", "1");
  }
})();`
          }}
        />
      </head>
      <body className={spaceGrotesk.className}>
        <UiThemeProvider>{children}</UiThemeProvider>
      </body>
    </html>
  );
}
