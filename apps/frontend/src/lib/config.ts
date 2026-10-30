function publicBackendUrl(): string {
  try {
    // Production builds replace this exact expression. In the browser dev
    // server, `process` is not defined, so fall back to the local API.
    return process.env.PUBLIC_BACKEND_URL ?? "http://localhost:3001";
  } catch {
    return "http://localhost:3001";
  }
}

export const BACKEND_URL = publicBackendUrl();
