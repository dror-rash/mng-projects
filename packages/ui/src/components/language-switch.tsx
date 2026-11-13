"use client";

import { type Locale, LOCALES, localeCookie, localeName } from "@repo/i18n";
import * as React from "react";

import { cn } from "../lib/utils";

type LanguageSwitchProps = {
  /** The language the server rendered with. */
  locale: Locale;
  /** The group's accessible name, translated by the caller (`ui.languageSwitch.label`). */
  label: string;
  /** Renders the page again in the new language. A full reload, so every zone and island follows. */
  reload?: () => void;
  className?: string;
};

/**
 * English / עברית (ADR-0011). Each language is named in itself and marked with its `lang`, so anyone finds
 * theirs. Stores the choice in the `locale` cookie every zone reads, then reloads: the server sets
 * `<html lang dir>` and picks the messages.
 */
export function LanguageSwitch({ locale, label, reload = () => window.location.reload(), className }: LanguageSwitchProps) {
  const name = React.useId();

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = localeCookie(next);
    reload();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md border p-0.5", className)}>
      {LOCALES.map((option) => (
        <label key={option} className="relative">
          <input
            type="radio"
            name={name}
            value={option}
            lang={option}
            checked={locale === option}
            onChange={() => choose(option)}
            // Transparent over its label, so the radio itself takes the click and the focus.
            className="peer absolute inset-0 cursor-pointer appearance-none opacity-0"
          />
          <span
            lang={option}
            className={cn(
              "pointer-events-none block rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground peer-hover:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              locale === option && "bg-secondary text-secondary-foreground",
            )}
          >
            {localeName(option)}
          </span>
        </label>
      ))}
    </div>
  );
}
