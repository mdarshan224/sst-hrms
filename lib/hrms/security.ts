export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self' blob:; frame-ancestors 'self' https://chatgpt.com",
};
export function protectedHeaders() {
  return { ...securityHeaders, "Cache-Control": "no-store" };
}
export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders))
    headers.set(key, value);
  if (
    headers.get("content-type")?.includes("text/html") ||
    headers.get("content-type")?.includes("application/json")
  )
    headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
