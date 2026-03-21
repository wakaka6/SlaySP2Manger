import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { getAppBootstrap } from "../lib/desktop";
import { MESSAGES, type Locale, type MessageKey } from "./messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce(
    (current, [key, value]) => current.split(`{${key}}`).join(String(value)),
    template,
  );
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>("zh-CN");

  useEffect(() => {
    void getAppBootstrap()
      .then((bootstrap) => {
        const nextLocale = bootstrap.locale === "en-US" ? "en-US" : "zh-CN";
        setLocale(nextLocale);
      })
      .catch(() => {
        setLocale("zh-CN");
      });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => {
        const localized = MESSAGES[locale][key] ?? MESSAGES["en-US"][key] ?? key;
        return interpolate(localized, params);
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
