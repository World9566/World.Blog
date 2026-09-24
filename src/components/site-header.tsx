"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import { Icon } from "./icon";
import { AuthNav } from "./auth-nav";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/articles", name: "文章" },
  { href: "/topics", name: "专题" },
  { href: "/about", name: "关于" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
        menu.current?.focus();
      }
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        /INPUT|TEXTAREA|SELECT/.test(target.tagName)
      )
        return;
      if (
        (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey)
      ) {
        event.preventDefault();
        setOpen(false);
        router.push("/search");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, router]);
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        跳到正文
      </a>
      <div className="global-nav container">
        <Link
          href="/"
          className="wordmark"
          aria-label={`${site.name} 首页`}
          onClick={() => setOpen(false)}
        >
          {site.name}
          <span className="wordmark-dot">.</span>
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="nav-tools">
          <Link
            href="/search"
            className="nav-search"
            aria-label="搜索文章"
            onClick={() => setOpen(false)}
          >
            <Icon name="search" />
            <span>搜索</span>
            <kbd>/</kbd>
          </Link>
          <ThemeToggle />
          <AuthNav onNavigate={() => setOpen(false)} />
          <button
            ref={menu}
            className="mobile-menu-button icon-button"
            aria-label={open ? "关闭导航" : "打开导航"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        className="mobile-navigation"
        aria-label="手机导航"
        hidden={!open}
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.name}
            <Icon name="chevron" />
          </Link>
        ))}
      </nav>
    </header>
  );
}
