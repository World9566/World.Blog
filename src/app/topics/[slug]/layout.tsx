import { notFound } from "next/navigation";
import { getArticles } from "@/lib/content";
import { topicsForArticles } from "@/lib/topics";

export default async function TopicLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}>) {
  const slug = (await params).slug;
  if (
    !topicsForArticles(await getArticles()).some((topic) => topic.slug === slug)
  )
    notFound();
  return children;
}
