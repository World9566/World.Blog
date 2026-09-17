import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/page-session";
import { prisma } from "@/lib/prisma";
import { deviceName } from "@/lib/account-policy";
import { ProfileForm } from "@/components/profile-form";
import { SessionList } from "@/components/session-list";
import { UserAvatar } from "@/components/user-avatar";
import { SignOut } from "@/components/sign-out";
import { Icon } from "@/components/icon";
import { AccountActivity } from "@/components/account-activity";

export const metadata: Metadata = {
  title: "个人中心",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
const date = (value: Date, withTime = false) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(value);

export default async function AccountPage() {
  const session = await requireSession();
  const user = session.user;
  const [account, sessions] = await Promise.all([
    prisma.account.findFirst({
      where: { userId: user.id, providerId: "github" },
      select: { accountId: true },
    }),
    prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, createdAt: true },
    }),
  ]);
  const githubLink =
    user.githubUsername &&
    /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(user.githubUsername)
      ? `https://github.com/${user.githubUsername}`
      : "https://github.com/settings/profile";
  return (
    <main id="main-content" className="account-page">
      <header className="account-heading container">
        <div className="account-identity">
          <UserAvatar name={user.name} image={user.image} large />
          <div>
            <p className="eyebrow">个人中心</p>
            <h1>你好，{user.name}。</h1>
            <p className="account-joined">
              加入于 {date(user.createdAt)}
              {user.role === "admin" && (
                <span className="role-badge">管理员</span>
              )}
            </p>
          </div>
        </div>
        <div className="account-heading-actions">
          {user.role === "admin" && (
            <Link href="/admin" className="text-link">
              管理中心 <Icon name="arrow" />
            </Link>
          )}
          <Link href="/articles" className="text-link">
            继续阅读 <Icon name="arrow" />
          </Link>
        </div>
      </header>
      <div className="account-layout container">
        <aside>
          <nav className="account-navigation" aria-label="个人中心导航">
            <a href="#reading">
              我的阅读 <Icon name="chevron" width="16" height="16" />
            </a>
            <a href="#profile">
              基本资料 <Icon name="chevron" width="16" height="16" />
            </a>
            <a href="#security">
              登录与安全 <Icon name="chevron" width="16" height="16" />
            </a>
          </nav>
        </aside>
        <div className="account-content">
          <AccountActivity />
          <section id="profile" className="account-card">
            <div className="account-section-heading">
              <h2>基本资料</h2>
              <p>用你喜欢的方式介绍自己。</p>
            </div>
            <ProfileForm initialName={user.name} initialBio={user.bio || ""} />
          </section>
          <section id="security" className="account-card">
            <div className="account-section-heading">
              <h2>登录与安全</h2>
              <p>查看关联账号，管理已登录的设备。</p>
            </div>
            <div className="connected-account">
              <Icon name="github" width="32" height="32" />
              <div>
                <h3>GitHub</h3>
                <p>
                  {user.githubUsername
                    ? `@${user.githubUsername}`
                    : "GitHub 账号"}
                </p>
              </div>
              <a
                href={githubLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                查看 <Icon name="external" width="16" height="16" />
              </a>
            </div>
            <dl className="account-details">
              <div>
                <dt>邮箱</dt>
                <dd>
                  {user.email}
                  <span>仅自己可见</span>
                </dd>
              </div>
              {account && (
                <div>
                  <dt>GitHub ID</dt>
                  <dd>{account.accountId}</dd>
                </div>
              )}
            </dl>
            <div className="devices-heading">
              <h3>登录设备</h3>
              <p>退出不再使用的设备，保留当前登录。</p>
            </div>
            <SessionList
              sessions={sessions.map((item) => ({
                id: item.id,
                device: deviceName(item.userAgent),
                createdAt: date(item.createdAt, true),
                current: item.id === session.session.id,
              }))}
            />
            <div className="account-signout">
              <div>
                <h3>退出当前账号</h3>
                <p>下次回来时，使用 GitHub 即可再次登录。</p>
              </div>
              <SignOut />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
