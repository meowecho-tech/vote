import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import { AppHeader } from "@/components/shell/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vote Platform Console",
  description: "Election operations and secure voting platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = "vote_theme";
                  var stored = window.localStorage.getItem(key);
                  var theme = stored === "light" || stored === "dark" ? stored : "dark";
                  document.documentElement.classList.toggle("dark", theme === "dark");
                  document.documentElement.style.colorScheme = theme;
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background font-sans antialiased">
        <AppProviders>
          <div className="election-shell mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
            <AppHeader />
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
