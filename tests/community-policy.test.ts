import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { parseComment, parseReaction } from "../src/lib/community-policy";

test("comments enforce length, control characters, parent and author boundaries", () => {
  const requestId = randomUUID();
  assert.deepEqual(parseComment({ body: "  第一行\r\n第二行  ", requestId }), {
    ok: true,
    body: "第一行\n第二行",
    parentId: null,
    requestId,
  });
  for (const value of [
    null,
    [],
    { body: "", requestId },
    { body: " ", requestId },
    { body: "x".repeat(2001), requestId },
    { body: "x\u0000", requestId },
    { body: "hello", requestId, userId: "other" },
    { body: "hello", requestId, parentId: "invalid" },
    { body: "hello", requestId: "bad" },
  ])
    assert.equal(parseComment(value).ok, false);
  assert.equal(
    parseComment({ body: "<script>alert(1)</script>", requestId }).ok,
    true,
  );
});

test("reactions require explicit desired state and reject mass assignment", () => {
  assert.deepEqual(parseReaction({ kind: "like", active: true }), {
    kind: "like",
    active: true,
  });
  assert.deepEqual(parseReaction({ kind: "bookmark", active: false }), {
    kind: "bookmark",
    active: false,
  });
  for (const value of [
    null,
    [],
    { kind: "like" },
    { kind: "like", active: "true" },
    { kind: "other", active: true },
    { kind: "bookmark", active: true, userId: "other" },
  ])
    assert.equal(parseReaction(value), null);
});
