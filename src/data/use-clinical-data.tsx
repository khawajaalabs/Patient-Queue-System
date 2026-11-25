import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Btn, PanelSkeleton } from "@/components/qc";
import { friendlyError } from "@/services/errors";

/**
 * Shared read hook for the application APIs.
 *
 * Previously every mount issued a fresh fetch with no cache, so the same
 * endpoint was requested several times per page load and again on every
 * navigation. TanStack Query now deduplicates by URL and serves recent data
 * instantly. Components keep the same { data, error, reload } contract.
 */
export function useClinicalData<T>(path: string | null) {
  const queryClient = useQueryClient();
  const result = useQuery<T, Error>({
    queryKey: ["api", path],
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    enabled: Boolean(path),
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["api", path] });
  }, [queryClient, path]);
  return {
    data: (result.data ?? null) as T | null,
    error: result.error ? friendlyError(result.error) : "",
    reload,
  };
}

export function ClinicalLoading({ error, retry }: { error: string; retry: () => void }) {
  if (!error) return <PanelSkeleton rows={3} />;
  return (
    <div className="surface p-8 text-sm">
      <p role="alert" className="mb-4 text-destructive">
        {error}
      </p>
      <Btn variant="secondary" onClick={retry}>
        Try again
      </Btn>
    </div>
  );
}
