export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;

  constructor(message: string, options?: { status?: number; code?: string | null; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status ?? 0;
    this.code = options?.code ?? null;
    this.details = options?.details;
  }
}

export function getErrorMessage(error: unknown, fallback = "request failed"): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return fallback;
}
