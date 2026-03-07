import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface LanguageContextValue {
  language: string;
  setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "English",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(
    () => localStorage.getItem("roadbook_lang") ?? "English"
  );

  const setLanguage = (lang: string) => {
    localStorage.setItem("roadbook_lang", lang);
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
