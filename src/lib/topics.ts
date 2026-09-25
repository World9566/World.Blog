import type { Article } from "./article-types";

export interface Topic {
  slug: string;
  name: string;
  description: string;
  cover: string | null;
}

// Defaults keep existing article metadata compatible. New topics need no code changes.
const defaults: Topic[] = [
  {
    slug: "engineering",
    name: "工程实践",
    description: "让工具和流程，成为解决问题的助力。",
    cover: null,
  },
  {
    slug: "web",
    name: "Web 开发",
    description: "从页面到服务，理解每一次交互的背后。",
    cover: null,
  },
  {
    slug: "fundamentals",
    name: "计算机基础",
    description: "回到原理，把习以为常的事情想清楚。",
    cover: null,
  },
];

export function defaultTopic(slug: string): Topic {
  return (
    defaults.find((topic) => topic.slug === slug) ?? {
      slug,
      name: slug,
      description: "",
      cover: null,
    }
  );
}

export function topicsForArticles(articles: Article[]) {
  const topics = new Map<string, Topic & { count: number }>();
  for (const article of articles) {
    const topic = topics.get(article.topic);
    if (topic) topic.count++;
    else
      topics.set(article.topic, {
        slug: article.topic,
        name: article.topicName,
        description: article.topicDescription,
        cover: article.topicCover,
        count: 1,
      });
  }
  // Articles arrive newest first, so active topics naturally appear first.
  return [...topics.values()];
}
