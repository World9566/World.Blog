import assert from "node:assert/strict";
import test from "node:test";
import {
  safeReturnTo,
  parseProfile,
  isBanned,
  safeAvatar,
} from "../src/lib/account-policy";

test("login return targets stay on known local pages", () => {
  for (const value of [
    "/",
    "/account",
    "/admin",
    "/articles/docker-images-containers-and-volumes",
    "/search?q=Docker",
    "/topics/web#main-content",
  ])
    assert.equal(safeReturnTo(value), value);
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/login",
    "/api/auth/sign-out",
    "/%0d%0aLocation:x",
    "/articles/../../login",
    "/%",
    ["/account"],
  ])
    assert.equal(safeReturnTo(value), "/account");
});

test("profile input validates the writable field boundary", () => {
  assert.deepEqual(
    parseProfile({ name: "  测试用户  ", bio: " 第一行\n第二行 " }),
    { ok: true, data: { name: "测试用户", bio: "第一行\n第二行" } },
  );
  for (const value of [
    null,
    [],
    { name: 1, bio: "" },
    { name: "x", bio: "" },
    { name: "x".repeat(41), bio: "" },
    { name: "换\n行", bio: "" },
    { name: "有效名称", bio: "x".repeat(501) },
    { name: "有效名称", bio: "", role: "admin" },
    { name: "有效名称", bio: "", banned: false },
    { name: "有效名称", bio: "", userId: "another-user" },
  ])
    assert.equal(parseProfile(value).ok, false);
});

test("bans apply immediately and respect their expiration", () => {
  const now = new Date("2026-09-15T12:00:00Z").getTime();
  assert.equal(isBanned({ banned: false }, now), false);
  assert.equal(isBanned({ banned: true }, now), true);
  assert.equal(
    isBanned({ banned: true, banExpires: "2026-09-16T00:00:00Z" }, now),
    true,
  );
  assert.equal(
    isBanned({ banned: true, banExpires: "2026-09-14T00:00:00Z" }, now),
    false,
  );
});

test("avatar URLs only use GitHub's HTTPS avatar host", () => {
  assert.equal(
    safeAvatar("https://avatars.githubusercontent.com/u/1?v=4"),
    "https://avatars.githubusercontent.com/u/1?v=4",
  );
  for (const value of [
    "javascript:alert(1)",
    "https://avatars.githubusercontent.com.evil.example/a.png",
    "http://avatars.githubusercontent.com/u/1",
    "data:image/svg+xml,abc",
    "https://example.com/a.png",
  ])
    assert.equal(safeAvatar(value), undefined);
});
