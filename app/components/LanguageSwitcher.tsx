"use client";

import { Languages } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useI18n } from "@/lib/i18n";
import { supportedLanguages, type Language } from "@/lib/i18n-core";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <Card className={cn("language-switcher-card py-0", className)} size="sm">
      <CardContent className="language-switcher-content">
        <div className="language-switcher-label">
          <Languages size={15} aria-hidden="true" />
          <span>{t("language.label")}</span>
        </div>
        <RadioGroup
          aria-label={t("language.label")}
          className="language-switcher-options"
          value={language}
          onValueChange={(value) => setLanguage(value as Language)}
        >
          {supportedLanguages.map((item) => (
            <label className={cn("language-option", language === item && "active")} key={item}>
              <RadioGroupItem value={item} />
              <span>{t(`language.${item}`)}</span>
            </label>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
