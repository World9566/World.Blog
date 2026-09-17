import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { githubConfigured } from "@/lib/auth-config";
import { safeReturnTo } from "@/lib/account-policy";
import { GitHubLogin } from "@/components/github-login";
import { Icon } from "@/components/icon";

export const metadata: Metadata = {
  title: "登录",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  if (await readSession(await headers())) redirect(returnTo);
  return (
    <main id="main-content" className="login-page">
      <section className="login-panel">
        <span className="login-monogram" aria-hidden="true">
          W<span>.</span>
        </span>
        <p className="eyebrow">欢迎来到 World</p>
        <h1>让好奇，有个归处。</h1>
        <p className="login-description">
          使用 GitHub 登录，管理你的个人资料。
        </p>
        <GitHubLogin available={githubConfigured} returnTo={returnTo} />
        {params.error && (
          <p className="form-error login-error" role="alert">
            登录未完成，请重新尝试。
          </p>
        )}
        <p className="login-note">首次登录会自动创建账号。</p>
        <Link href="/articles" className="text-link">
          先读几篇文章 <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
