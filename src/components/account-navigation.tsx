"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

const sections = [
  { id: "reading", label: "我的阅读" },
  { id: "profile", label: "基本资料" },
  { id: "security", label: "登录与安全" },
] as const;

type SectionId = (typeof sections)[number]["id"];

export function AccountNavigation() {
  const [active, setActive] = useState<SectionId>("reading");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const threshold = Math.min(180, window.innerHeight * 0.28);
      let current: SectionId = sections[0].id;

      for (const section of sections) {
        const top = document
          .getElementById(section.id)
          ?.getBoundingClientRect().top;
        if (top !== undefined && top <= threshold) {
          current = section.id;
        }
      }

      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
      ) {
        current = sections.at(-1)?.id ?? current;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, []);

  return (
    <nav className="account-navigation" aria-label="个人中心导航">
      {sections.map((section) => (
        <a
          href={`#${section.id}`}
          key={section.id}
          aria-current={active === section.id ? "location" : undefined}
        >
          {section.label}
          <Icon name="chevron" width="16" height="16" />
        </a>
      ))}
    </nav>
  );
}
