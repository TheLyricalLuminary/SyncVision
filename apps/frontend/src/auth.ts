// Dev auth bootstrap.
// Backend was retrofitted with requirePlan() middleware (User/Catalog models).
// The frontend has no login UI yet; until one is built, we auto-login as the
// seeded dev user and inject Authorization: Bearer <token> into every fetch().

const TOKEN_KEY = "syncvision.devToken";
const DEV_EMAIL = "dev@local";
const DEV_PASSWORD = "devpassword12345";

// Capture original BEFORE any replacement so auth calls never re-enter the
// wrapper — that would cause infinite recursion → "Maximum call stack exceeded".
const originalFetch: typeof window.fetch = window.fetch.bind(window);

async function login(): Promise<string> {
  // Always use originalFetch here — bypasses the wrapper completely.
  const res = await originalFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Auto-login failed: HTTP ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

async function ensureAuthToken(): Promise<string> {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (cached) return cached;
  return login();
}

let installed = false;

export function installAuthedFetch(): void {
  if (installed) return; // Guard against Vite HMR calling this twice
  installed = true;

  window.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;

    // Auth endpoints and non-API paths go direct — no token injection needed.
    if (!url.startsWith("/api/") || url.startsWith("/api/auth/")) {
      return originalFetch(input, init);
    }

    const token = await ensureAuthToken();

    const makeHeaders = (): Headers => {
      const h = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      h.set("Authorization", `Bearer ${token}`);
      return h;
    };

    let res = await originalFetch(input, { ...init, headers: makeHeaders() });

    if (res.status === 401) {
      // Token rejected — refresh once and retry.
      localStorage.removeItem(TOKEN_KEY);
      const fresh = await login();
      const h2 = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      h2.set("Authorization", `Bearer ${fresh}`);
      res = await originalFetch(input, { ...init, headers: h2 });
    }

    return res;
  };
}
