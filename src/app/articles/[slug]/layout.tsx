import { notFound } from "next/navigation";
import { findArticle } from "@/lib/content";

export default async function ArticleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}>) {
  if (!(await findArticle((await params).slug))) notFound();
  return children;
}
