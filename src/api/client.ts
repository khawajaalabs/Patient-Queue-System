export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-QueueCare-Request": "1" },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const result = (await response.json()) as {
      success: boolean;
      data: T;
      error?: { code: string; message: string };
    };
    if (!response.ok || !result.success) {
      if (response.status === 401 && !path.startsWith("/auth/"))
        window.dispatchEvent(new Event("queuecare:session-expired"));
      throw new ApiError(
        result.error?.message ?? "Unable to complete this request.",
        result.error?.code ?? "REQUEST_FAILED",
        response.status,
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new Error("Unable to reach the local API. Start npm.cmd run demo and try again.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
