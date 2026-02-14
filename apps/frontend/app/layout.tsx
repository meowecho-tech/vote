import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vote Platform",
  description: "Secure election and voting platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
