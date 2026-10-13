import type { Metadata } from "next";
import "./globals.css";
import "@/components/workflow.css";
export const metadata: Metadata = {
  title: "Sohan Soft Tech HRMS | People & Workforce Platform",
  description:
    "Secure company workspaces for people operations and recruitment.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/brand/sohan-soft-tech-logo.png",
    apple: "/brand/sohan-soft-tech-logo.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
