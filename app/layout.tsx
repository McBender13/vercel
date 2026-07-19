import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Debate Arena",
  description: "A three-round, evidence-based sports debate game."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
