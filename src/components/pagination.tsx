import Link from "next/link";

export const PAGE_SIZE = 6;
export function parsePage(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d{1,6}$/.test(value)
    ? Math.max(1, Number(value))
    : 1;
}
export function Pagination({
  page,
  total,
  pathname,
  params = {},
}: {
  page: number;
  total: number;
  pathname: string;
  params?: Record<string, string>;
}) {
  const count = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (count <= 1) return null;
  function href(value: number) {
    return `${pathname}?${new URLSearchParams({ ...params, page: String(value) })}`;
  }
  return (
    <nav className="pagination" aria-label="分页">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev">
          上一页
        </Link>
      ) : (
        <span aria-disabled="true">上一页</span>
      )}
      <span>
        {page} / {count}
      </span>
      {page < count ? (
        <Link href={href(page + 1)} rel="next">
          下一页
        </Link>
      ) : (
        <span aria-disabled="true">下一页</span>
      )}
    </nav>
  );
}
