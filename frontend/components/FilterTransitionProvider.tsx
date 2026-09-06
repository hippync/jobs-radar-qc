"use client";

import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from "react";

interface FilterTransitionValue {
  isPending: boolean;
  startFilterTransition: TransitionStartFunction;
}

const FilterTransitionContext = createContext<FilterTransitionValue | null>(null);

/**
 * Shares one pending state across every control that can trigger a filter
 * navigation (FilterSidebar, MobileFilterDrawer, ActiveFilterChips) so a
 * single loading indicator (KpiLoadingBar) can react regardless of which
 * control the user touched — each previously had its own local
 * useTransition, visible only on that one control.
 */
export function FilterTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startFilterTransition] = useTransition();
  return (
    <FilterTransitionContext.Provider value={{ isPending, startFilterTransition }}>
      {children}
    </FilterTransitionContext.Provider>
  );
}

export function useFilterTransition(): FilterTransitionValue {
  const ctx = useContext(FilterTransitionContext);
  if (!ctx) {
    throw new Error("useFilterTransition must be used within a FilterTransitionProvider");
  }
  return ctx;
}
