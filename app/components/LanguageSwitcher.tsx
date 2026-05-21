"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supportedLanguages } from "@/lib/i18n-core";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className={cn("language-switcher-card", className)} role="radiogroup" aria-label={t("language.label")}>
      <div className="language-switcher-content">
        <div className="language-switcher-label">
          <Languages size={15} aria-hidden="true" />
          <span>{t("language.label")}</span>
        </div>
        <div className="language-switcher-options">
          {supportedLanguages.map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={language === item}
              className={cn("language-option", language === item && "active")}
              key={item}
              onClick={() => setLanguage(item)}
            >
              {t(`language.${item}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
