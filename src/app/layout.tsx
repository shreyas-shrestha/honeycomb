import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Source_Sans_3, Young_Serif } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Shell } from "@/components/Shell";

// Young Serif: page titles. Source Sans: everything else. The mono is for code and trace cells.
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"], style: ["normal", "italic"] });
const code = Atkinson_Hyperlegible_Mono({ variable: "--font-code", subsets: ["latin"] });
const display = Young_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400" });

// Every screen here is rendered in the browser after the session is checked, so
// there is no prerendered page for the framework's instant-navigation check to validate.
export const instant = false;

export const metadata: Metadata = {
  title: "Honeycomb",
  description: "Interactive lessons, practice and review built around the Georgia Tech course you are taking.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
