export const PLUS_PRICE_USD = 8;
export const PLUS_VALUE_USD = 60;
export const PLUS_MONTHLY_REQUESTS = 1500;
export const FREE_MONTHLY_REQUESTS = 500;

export const plusPriceLabel = `$${PLUS_PRICE_USD}`;
export const plusMonthlyPriceLabel = `${plusPriceLabel}/month`;
export const plusMonthlyPriceText = `$${PLUS_PRICE_USD}/month`;
export const plusMonthlyPriceLabelEn = `${plusPriceLabel}/month`;
export const plusMonthlyPriceTextEn = `$${PLUS_PRICE_USD}/month`;
export const plusSavingsPercent = Math.round((1 - PLUS_PRICE_USD / PLUS_VALUE_USD) * 100);

export const pricingTemplateValues: Record<string, string> = {
  "{{PLUS_PRICE}}": plusPriceLabel,
  "{{PLUS_MONTHLY_PRICE}}": plusMonthlyPriceLabel,
  "{{PLUS_MONTHLY_PRICE_TEXT}}": plusMonthlyPriceText,
  "{{PLUS_VALUE}}": `$${PLUS_VALUE_USD}`,
  "{{PLUS_VALUE_PLUS}}": `$${PLUS_VALUE_USD}+`,
  "{{PLUS_SAVINGS_PERCENT}}": `${plusSavingsPercent}%`,
  "{{PLUS_MONTHLY_REQUESTS}}": PLUS_MONTHLY_REQUESTS.toString(),
  "{{FREE_MONTHLY_REQUESTS}}": FREE_MONTHLY_REQUESTS.toString(),
};

export const pricingTemplateValuesEn: Record<string, string> = {
  ...pricingTemplateValues,
  "{{PLUS_MONTHLY_PRICE}}": plusMonthlyPriceLabelEn,
  "{{PLUS_MONTHLY_PRICE_TEXT}}": plusMonthlyPriceTextEn,
};
