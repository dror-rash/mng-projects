import { localeDir, parseLocale } from "@repo/i18n";
import { parseTheme, systemThemeScript, THEME_COOKIE, themeClass } from "@repo/ui/theme";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = { title: "Template shell" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // The language i18n/request.ts picked, parsed again so only "en" or "he" reaches the attributes.
  const locale = parseLocale(await getLocale());

  return (
    // "system" is resolved by the inline script before paint, so the class may differ from the server's.
    <html lang={locale} dir={localeDir(locale)} className={themeClass(theme)} suppressHydrationWarning>
      <head>
        {theme === "system" && <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} />}
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
