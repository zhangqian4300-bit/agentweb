const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, headers: extraHeaders, ...rest } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(url, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, {
        ...rest,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    let detail = err.detail || "Request failed";
    if (Array.isArray(detail)) {
      detail = detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join("; ");
    } else if (typeof detail !== "string") {
      detail = JSON.stringify(detail);
    }
    throw new ApiError(res.status, detail);
  }

  return res.json();
}
