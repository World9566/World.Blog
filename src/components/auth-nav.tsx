"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/account-policy";
import { UserAvatar } from "./user-avatar";

export function AuthNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();
  if (isPending)
    return (
      <span className="auth-nav-placeholder" aria-label="正在确认登录状态" />
    );
  return data ? (
    <Link
      className="nav-account"
      href="/account"
      aria-label="个人中心"
      aria-current={pathname === "/account" ? "page" : undefined}
      onClick={onNavigate}
    >
      <UserAvatar name={data.user.name} image={data.user.image} />
      <span>个人中心</span>
    </Link>
  ) : (
    <Link
      className="nav-login"
      href={`/login?${new URLSearchParams({ next: safeReturnTo(pathname) })}`}
      onClick={onNavigate}
    >
      登录
    </Link>
  );
}
