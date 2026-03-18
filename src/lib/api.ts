export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!headers.has("Content-Type") && options.body !== undefined && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const errorBody = await response.json();
      const error = new Error(
        typeof errorBody?.message === "string"
          ? errorBody.message
          : typeof errorBody?.error === "string"
            ? errorBody.error
            : "요청 처리 중 오류가 발생했습니다.",
      ) as Error & { data?: unknown; status?: number };
      error.data = errorBody;
      error.status = response.status;
      throw error;
    }

    const error = new Error(await response.text()) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
