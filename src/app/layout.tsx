import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@playcanvas/supersplat-viewer/viewer.css";

export const metadata: Metadata = {
  title: "Splatwalk — Gaussian splat simulation studio",
  description:
    "Rapid-prototype studio for walkable Gaussian splat environments: upload a capture, draw your floorplan, animate your avatar and collect tester feedback.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
