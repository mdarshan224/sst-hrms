"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LatestRequest } from "../lib/hrms/latest-request";

/** Keep data and errors bound to their request scope; superseded responses cannot win. */
export function useJsonResource<T>(url: string, enabled = true) {
  const requests = useRef(new LatestRequest());
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string;
    loading: boolean;
  } | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    const request = requests.current.begin();
    setResult((previous) => ({
      key: url,
      data: previous?.key === url ? previous.data : null,
      error: "",
      loading: true,
    }));
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: request.signal,
      });
      const data = (await response.json()) as T & { error?: string };
      if (!response.ok)
        throw new Error(
          data.error ?? "Unable to load this section. Please retry.",
        );
      if (request.current())
        setResult({ key: url, data, error: "", loading: false });
    } catch (error) {
      if (request.current())
        setResult({
          key: url,
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load this section. Please retry.",
          loading: false,
        });
    }
  }, [url, enabled]);
  useEffect(() => {
    const gate = requests.current;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      gate.cancel();
    };
  }, [load]);
  const current = enabled && result?.key === url ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: enabled && (current?.loading ?? true),
    load,
  };
}
