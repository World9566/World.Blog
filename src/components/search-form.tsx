import { Icon } from "./icon";

export function SearchForm({
  query = "",
  topic = "",
}: {
  query?: string;
  topic?: string;
}) {
  return (
    <form
      key={`${query}:${topic}`}
      action="/search"
      method="get"
      className="search-form"
      role="search"
    >
      <label htmlFor="article-search" className="sr-only">
        搜索文章
      </label>
      <Icon name="search" width="24" height="24" />
      <input
        id="article-search"
        name="q"
        type="search"
        defaultValue={query}
        placeholder="搜索关键词、工具或一个问题"
        maxLength={120}
        autoComplete="off"
        enterKeyHint="search"
      />
      {topic && <input type="hidden" name="topic" value={topic} />}
      <button type="submit" className="button button-primary">
        搜索
      </button>
    </form>
  );
}
