import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const linux = process.platform === "linux";

test(
  "failed downloads exit the real deploy entry point, preserve the release and release the lock",
  { skip: !linux },
  () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "blog-pull-deploy-"));
    const previous = "1".repeat(40),
      target = "2".repeat(40);
    try {
      mkdirSync(path.join(root, "scripts/ops"), { recursive: true });
      mkdirSync(path.join(root, "bin"));
      mkdirSync(path.join(root, ".deploy/pull-test"), { recursive: true });
      for (const name of ["common.sh", "deploy.sh", "pull-images.sh"])
        copyFileSync(
          `scripts/ops/${name}`,
          path.join(root, "scripts/ops", name),
        );
      writeFileSync(
        path.join(root, ".env.production"),
        [
          "COMPOSE_PROJECT_NAME=pull-test",
          "SITE_URL=https://test.example.invalid",
          "SITE_HOST=test.example.invalid",
          "BLOG_IMAGE=test/blog",
          `BLOG_RELEASE=${previous}`,
          `POSTGRES_PASSWORD=${"a".repeat(64)}`,
          "",
        ].join("\n"),
      );
      const marker = path.join(root, ".deploy/pull-test/current-release");
      writeFileSync(marker, previous);
      // Both common.sh and timeout reach this executable Docker boundary.
      // Any container mutation or database action is an unexpected call.
      writeFileSync(
        path.join(root, "bin/docker"),
        `#!/usr/bin/env bash
set -eu
if [[ "$1" == info ]]; then exit 0; fi
if [[ "$1 $2" == 'image pull' ]]; then echo "pull $3" >> "$TEST_ROOT/events"; exit 1; fi
if [[ "$1" == compose && " $* " == *' config '* ]]; then
  if [[ " $* " == *' --images '* ]]; then printf '%s\\n' test/blog:image; fi
  exit 0
fi
echo "UNEXPECTED $*" >> "$TEST_ROOT/events"
exit 9
`,
        { mode: 0o755 },
      );
      const result = spawnSync(
        "bash",
        [path.join(root, "scripts/ops/deploy.sh"), target],
        {
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            PATH: `${root}/bin:${process.env.PATH}`,
            TEST_ROOT: root,
            BLOG_ENV_FILE: path.join(root, ".env.production"),
            BLOG_SKIP_PULL: "0",
            BLOG_PULL_ATTEMPTS: "2",
            BLOG_PULL_RETRY_DELAY: "0",
          },
        },
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(readFileSync(marker, "utf8"), previous);
      assert.equal(
        existsSync(path.join(root, ".deploy/pull-test/operation.lock")),
        false,
      );
      assert.equal(
        readFileSync(path.join(root, "events"), "utf8"),
        "pull test/blog:image\npull test/blog:image\n",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

function run(fault = "", options: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "blog-pull-test-"));
  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
set -euo pipefail
source scripts/ops/pull-images.sh
DOCKER=(bash tests/fixtures/pull-docker.sh)
dc() {
  if [[ "\${TEST_CONFIG_FAILURE:-}" == 1 ]]; then return 42; fi
  printf '%s\\n' ghcr.nju.edu.cn/test/web ghcr.nju.edu.cn/test/ops ghcr.nju.edu.cn/test/web
}
pull_images
echo ready-to-deploy
`,
      ],
      {
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          TEST_ROOT: root,
          TEST_FAULT: fault,
          BLOG_PULL_ATTEMPT_TIMEOUT: "1",
          BLOG_PULL_TOTAL_TIMEOUT: "10",
          BLOG_PULL_ATTEMPTS: "3",
          BLOG_PULL_RETRY_DELAY: "0",
          ...options,
        },
      },
    );
    let events = "";
    try {
      events = readFileSync(path.join(root, "events"), "utf8");
    } catch {
      /* No pulls were started. */
    }
    return { ...result, output: result.stdout + result.stderr, events };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test(
  "deployment images pull sequentially and duplicate references pull once",
  { skip: !linux },
  () => {
    const result = run();
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(result.events.trim().split("\n"), [
      "start ghcr.nju.edu.cn/test/web 1",
      "done ghcr.nju.edu.cn/test/web 1",
      "start ghcr.nju.edu.cn/test/ops 1",
      "done ghcr.nju.edu.cn/test/ops 1",
    ]);
  },
);

test(
  "transient registry failures retry without repeating completed images",
  { skip: !linux },
  () => {
    const result = run("transient");
    assert.equal(result.status, 0, result.output);
    assert.match(result.events, /done ghcr.nju.edu.cn\/test\/web 2/);
    assert.match(result.events, /done ghcr.nju.edu.cn\/test\/ops 2/);
    assert.doesNotMatch(result.events, / 3\n/);
  },
);

test(
  "a stalled pull emitting unchanged progress is canceled before retry",
  { skip: !linux },
  () => {
    const result = run("stalled");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /timed out/);
    assert.match(
      result.events,
      /cancel ghcr.nju.edu.cn\/test\/web 1\nstart ghcr.nju.edu.cn\/test\/web 2/,
    );
    assert.match(
      result.events,
      /cancel ghcr.nju.edu.cn\/test\/ops 1\nstart ghcr.nju.edu.cn\/test\/ops 2/,
    );
  },
);

test(
  "exhausted retries fail before the deployment can continue",
  { skip: !linux },
  () => {
    const result = run("failed");
    assert.notEqual(result.status, 0);
    assert.equal(result.events.trim().split("\n").length, 3);
    assert.doesNotMatch(result.output, /ready-to-deploy/);
    assert.doesNotMatch(result.events, /test\/ops/);
  },
);

test(
  "the total download budget bounds repeated stalls",
  { skip: !linux },
  () => {
    const result = run("always-stalled", {
      BLOG_PULL_TOTAL_TIMEOUT: "2",
      BLOG_PULL_ATTEMPTS: "9",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /budget exhausted/);
    assert.doesNotMatch(result.output, /ready-to-deploy/);
    assert.ok((result.events.match(/start /g) ?? []).length <= 2);
  },
);

test(
  "cancellation, invalid settings and compose failures are not retried",
  { skip: !linux },
  () => {
    const canceled = run("interrupted");
    assert.equal(canceled.status, 143);
    assert.equal(canceled.events.trim().split("\n").length, 1);
    const config = run("", { TEST_CONFIG_FAILURE: "1" });
    assert.equal(config.status, 42);
    assert.equal(config.events, "");
    const invalid = run("", { BLOG_PULL_ATTEMPT_TIMEOUT: "0" });
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.events, "");
  },
);
