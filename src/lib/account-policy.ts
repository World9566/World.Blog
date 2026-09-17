export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/account";
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//"))
      return "/account";
    const url = new URL(value, "https://blog.invalid");
    if (
      url.origin !== "https://blog.invalid" ||
      !/^\/(?:account|admin|articles(?:\/[a-z0-9-]+)?|topics(?:\/[a-z0-9-]+)?|search|about)?$/.test(
        url.pathname,
      )
    )
      return "/account";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/account";
  }
}

export function isBanned(
  user: { banned?: boolean | null; banExpires?: Date | string | null },
  now = Date.now(),
) {
  return (
    !!user.banned &&
    (!user.banExpires || new Date(user.banExpires).getTime() > now)
  );
}

export function parseProfile(
  value: unknown,
):
  | { ok: true; data: { name: string; bio: string } }
  | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, message: "请填写有效的个人资料。" };
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "name" && key !== "bio"))
    return { ok: false, message: "只能修改昵称和个人简介。" };
  if (typeof input.name !== "string" || typeof input.bio !== "string")
    return { ok: false, message: "请填写昵称和个人简介。" };
  const name = input.name.normalize("NFC").trim();
  const bio = input.bio.normalize("NFC").trim();
  if (name.length < 2 || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name))
    return { ok: false, message: "昵称需要 2 到 40 个字符，且不能包含换行。" };
  if (
    bio.length > 500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(bio)
  )
    return { ok: false, message: "个人简介最多 500 个字符，请移除无效字符。" };
  return { ok: true, data: { name, bio } };
}

export function deviceName(agent: string | null) {
  const value = agent || "";
  const browser = /Edg\//.test(value)
    ? "Edge"
    : /Firefox\//.test(value)
      ? "Firefox"
      : /Chrome\//.test(value)
        ? "Chrome"
        : /Safari\//.test(value)
          ? "Safari"
          : "浏览器";
  const system = /Android/.test(value)
    ? "Android"
    : /iPhone|iPad/.test(value)
      ? "iOS"
      : /Windows/.test(value)
        ? "Windows"
        : /Macintosh/.test(value)
          ? "macOS"
          : /Linux/.test(value)
            ? "Linux"
            : "未知设备";
  return `${system} · ${browser}`;
}

export function safeAvatar(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "avatars.githubusercontent.com"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
