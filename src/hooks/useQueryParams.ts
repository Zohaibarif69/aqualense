"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Drop-in for react-router's `useSearchParams()`: returns [params, setParams],
 * where setParams replaces the whole query string and pushes a history entry.
 */
export function useQueryParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setParams = (next: Record<string, string>) => {
    const qs = new URLSearchParams(next).toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return [params, setParams] as const;
}
