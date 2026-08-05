import { Public_Sans, Space_Grotesk } from "next/font/google";

import Providers from "./providers";
import "./globals.css";

// The two faces the design system calls for (design/psu-tokens.css). next/font
// self-hosts them, so there is no render-blocking request to Google at runtime.
// globals.css binds these variables onto --font-display / --font-body.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata = {
  title: "PSU Online Voting System",
  description: "Secure online voting for Puntland State University elections.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
