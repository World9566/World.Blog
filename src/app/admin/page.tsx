import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/page-session";
import { AdminDashboard } from "@/components/admin-dashboard";
import { Icon } from "@/components/icon";
import "./admin.css";

export const metadata: Metadata = {
  title: "管理中心",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <main id="main-content" className="admin-page">
      <header className="admin-heading container">
        <div>
          <p className="eyebrow">World</p>
          <h1>管理中心</h1>
          <p>照看讨论，也照顾每一位读者。</p>
        </div>
        <Link href="/account" className="text-link">
          个人中心 <Icon name="arrow" />
        </Link>
      </header>
      <AdminDashboard />
    </main>
  );
}
