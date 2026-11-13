import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "react-day-picker/style.css";
import "./globals.css";
import "./ui.css";

export const metadata: Metadata = {
  title: "Forma — Personal training, on your terms",
  description: "A personal trainer booking portal prototype. Explore one-to-one sessions and try a demo booking.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
