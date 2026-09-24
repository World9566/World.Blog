export const site = {
  name: "World",
  title: "World · 技术笔记",
  description: "从代码到原理，记录值得弄明白的技术问题。",
  author: "world9566",
  github: "https://github.com/World9566",
};

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

export function getSiteUrl() {
  return new URL(process.env.SITE_URL || "http://localhost:3000");
}
