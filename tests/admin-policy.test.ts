import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminAction, parseAdminQuery } from "../src/lib/admin-policy";

test("admin mutations accept only scoped actions and a bounded reason", () => {
  assert.deepEqual(
    parseAdminAction(
      { action: "comment.hide", reason: "  重复广告  " },
      "comment",
    ),
    { ok: true, action: "comment.hide", reason: "重复广告" },
  );
  for (const input of [
    null,
    [],
    {},
    { action: "user.ban", reason: "原因" },
    { action: "comment.hide", reason: "a" },
    { action: "comment.hide", reason: "x".repeat(501) },
    { action: "comment.hide", reason: "两行\n内容" },
    { action: "comment.hide", reason: "原因", actorId: "admin" },
    { action: "__proto__", reason: "原因" },
    { action: "comment.edit", reason: "原因" },
  ]) {
    assert.equal(parseAdminAction(input, "comment").ok, false);
  }
  assert.equal(
    parseAdminAction({ action: "user.promote", reason: "协助管理" }, "user").ok,
    true,
  );
});

test("admin searches constrain page size, query length, and section filters", () => {
  assert.deepEqual(
    parseAdminQuery(
      new URLSearchParams("status=pending&q=hello&page=2"),
      "comments",
    ),
    { status: "pending", q: "hello", page: 2 },
  );
  for (const params of [
    "page=0",
    "page=-1",
    "page=1.2",
    "page=10000",
    "status=admin",
    `q=${"x".repeat(101)}`,
    "q=abc%00def",
  ])
    assert.equal(
      parseAdminQuery(new URLSearchParams(params), "comments"),
      null,
    );
  assert.equal(
    parseAdminQuery(new URLSearchParams("status=pending"), "users"),
    null,
  );
  assert.equal(
    parseAdminQuery(new URLSearchParams("status=banned"), "audit"),
    null,
  );
});
