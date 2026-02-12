export function clearClientCookies(): void {
  if (typeof document === "undefined") return;

  const cookieString = document.cookie;
  if (!cookieString) return;

  const cookies = cookieString.split(";").map((part) => part.trim());

  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf("=");
    const name = eqIdx === -1 ? cookie : cookie.slice(0, eqIdx);

    if (!name) continue;

    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

