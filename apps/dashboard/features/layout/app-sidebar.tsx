import { parseLocale } from "@repo/i18n";
import { parseTheme, THEME_COOKIE } from "@repo/ui/theme";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";

import { navFor } from "./nav";
import { type AppSidebarProps, SidebarMenu } from "./sidebar-menu";

export type { AppSidebarProps };

/** `SidebarMenu` with the theme, the language and the messages read on the server. */
export async function AppSidebar(props: AppSidebarProps) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const [locale, nav, menu, ui] = await Promise.all([
    getLocale(),
    getTranslations("nav"),
    getTranslations("menu"),
    getTranslations("ui.languageSwitch"),
  ]);
  const items = navFor(props.role).map((item) => ({ ...item, label: nav(item.labelKey) }));

  return (
    <SidebarMenu
      {...props}
      items={items}
      theme={theme}
      locale={parseLocale(locale)}
      labels={{ menu: menu("label"), language: ui("label"), openMenu: menu("open"), closeMenu: menu("close") }}
    />
  );
}
