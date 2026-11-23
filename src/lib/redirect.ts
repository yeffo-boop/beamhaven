/**
 * Where to send someone after they sign in. Only paths on this site are
 * allowed ("/projects"), never another website ("https://evil.example" or
 * "//evil.example"), so a crafted sign-in link can't bounce people elsewhere.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
