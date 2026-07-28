"use client";

import { createContext, useContext } from "react";

type ReportChromeValue = {
  onViewEngine?: () => void;
};

const ReportChromeContext = createContext<ReportChromeValue>({});

export function ReportChromeProvider({
  onViewEngine,
  children,
}: {
  onViewEngine?: () => void;
  children: React.ReactNode;
}) {
  return (
    <ReportChromeContext.Provider value={{ onViewEngine }}>
      {children}
    </ReportChromeContext.Provider>
  );
}

export function useReportChrome() {
  return useContext(ReportChromeContext);
}
