"use client";

import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    const timers = [0, 150, 500].map((delay) =>
      window.setTimeout(() => {
        document.title = title;
      }, delay),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [title]);
}
