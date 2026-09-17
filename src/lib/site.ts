export const site = {
  name: "World",
  title: "World · 技术笔记",
  description: "从代码到原理，记录值得弄明白的技术问题。",
  author: "world9566",
  github: "https://github.com/World9566",
};

export const topics = [
  {
    slug: "engineering",
    name: "工程实践",
    description: "让工具和流程，成为解决问题的助力。",
    symbol: "01",
  },
  {
    slug: "web",
    name: "Web 开发",
    description: "从页面到服务，理解每一次交互的背后。",
    symbol: "02",
  },
  {
    slug: "fundamentals",
    name: "计算机基础",
    description: "回到原理，把习以为常的事情想清楚。",
    symbol: "03",
  },
] as const;

export type TopicSlug = (typeof topics)[number]["slug"];
export const getTopic = (slug: string) =>
  topics.find((topic) => topic.slug === slug);

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
