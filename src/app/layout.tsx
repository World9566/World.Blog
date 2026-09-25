import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { getSiteUrl, site } from "@/lib/site";
import "./globals.css";

const themeInitScript = `
(() => {
  const theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);
})();`;

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: site.title, template: `%s · ${site.name}` },
  description: site.description,
  authors: [{ name: site.author, url: site.github }],
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
  robots: { index: !!process.env.SITE_URL, follow: !!process.env.SITE_URL },
  openGraph: {
    title: site.title,
    description: site.description,
    locale: "zh_CN",
    type: "website",
    siteName: site.name,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SiteHeader />
        <Suspense fallback={null}>
          <NavigationFeedback />
        </Suspense>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
