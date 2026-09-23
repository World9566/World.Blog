import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const linux = process.platform === "linux";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "blog-deploy-test-"));
  const releases = path.join(root, "content/releases");
  const writer = path.join(root, "writer");
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", writer, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  mkdirSync(path.join(root, "scripts/ops"), { recursive: true });
  mkdirSync(path.join(writer, "posts"), { recursive: true });
  mkdirSync(path.join(root, "model"));
  for (const name of ["common.sh", "content-deploy.sh"])
    copyFileSync(`scripts/ops/${name}`, path.join(root, "scripts/ops", name));
  copyFileSync(
    "tests/fixtures/content-docker.sh",
    path.join(root, "docker.sh"),
  );
  writeFileSync(
    path.join(root, "bash-env"),
    'docker() { bash "$TEST_ROOT/docker.sh" "$@"; }\nexport -f docker\n',
  );
  writeFileSync(path.join(root, "model/count"), "0");
  writeFileSync(
    path.join(root, ".env.production"),
    [
      "COMPOSE_PROJECT_NAME=world-blog-test",
      "SITE_URL=https://test.example.invalid",
      "SITE_HOST=test.example.invalid",
      "BLOG_IMAGE=test/blog",
      `BLOG_RELEASE=${"1".repeat(40)}`,
      `POSTGRES_PASSWORD=${"a".repeat(64)}`,
      `CONTENT_ROOT=${root}/content`,
      "CONTENT_REFRESH_TOKEN=disposable-test-key",
      "",
    ].join("\n"),
  );
  const run = (revision: string, fault = "", app = "1".repeat(40)) => {
    const result = spawnSync(
      "bash",
      [path.join(root, "scripts/ops/content-deploy.sh"), revision],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 20000,
        input:
          revision === "--ensure"
            ? ""
            : readFileSync(path.join(root, "content.bundle")),
        env: {
          ...process.env,
          BLOG_OPERATION_LOCK_HELD: "0",
          BLOG_ENV_FILE: path.join(root, ".env.production"),
          BLOG_RELEASE: app,
          BASH_ENV: path.join(root, "bash-env"),
          TEST_ROOT: root,
          TEST_FAULT: fault,
        },
      },
    );
    return { ...result, output: result.stdout + result.stderr };
  };
  const ensure = run("--ensure");
  assert.equal(ensure.status, 0, ensure.output);
  git("init", "--quiet");
  let count = 0;
  const commit = () => {
    writeFileSync(
      path.join(writer, "posts/test.mdx"),
      `content version ${++count}`,
    );
    git("add", "posts");
    git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      `version ${count}`,
    );
    git("bundle", "create", path.join(root, "content.bundle"), "HEAD");
    return git("rev-parse", "HEAD");
  };
  const publish = () => {
    const sha = commit(),
      result = run(sha);
    assert.equal(result.status, 0, result.output);
    return sha;
  };
  return {
    root,
    releases,
    run,
    commit,
    publish,
    journal: path.join(root, "content/state/in-progress"),
    current: () => readlinkSync(path.join(releases, "current")),
    search: () => readFileSync(path.join(root, "model/live"), "utf8"),
    cleanup: () => {
      assert.equal(path.dirname(root), os.tmpdir());
      assert.ok(path.basename(root).startsWith("blog-deploy-test-"));
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test(
  "pruning preserves current and previous worktrees when republishing an older revision",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      const revisions: string[] = [];
      for (let i = 0; i < 6; i++) {
        const sha = f.publish();
        revisions.push(sha);
        const time = new Date(2000, 0, i + 1);
        utimesSync(path.join(f.releases, sha), time, time);
      }
      const old = revisions[1];
      symlinkSync(old, path.join(f.releases, "another-alias"));
      const result = f.run(old);
      assert.equal(result.status, 0, result.output);
      assert.equal(f.current(), old);
      assert.ok(existsSync(path.join(f.releases, "current/posts/test.mdx")));
      assert.ok(existsSync(path.join(f.releases, "previous/posts/test.mdx")));
      assert.equal(f.search(), old);
      assert.equal(
        readdirSync(f.releases).filter((name) => /^[a-f0-9]{40}$/.test(name))
          .length,
        5,
      );
    } finally {
      f.cleanup();
    }
  },
);

test(
  "failed application revalidation preserves the live content and old marker",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      const sha = f.publish();
      const marker = path.join(f.releases, sha, ".release-ready");
      const before = readFileSync(marker, "utf8");
      assert.notEqual(f.run("--ensure", "validate", "2".repeat(40)).status, 0);
      assert.equal(f.current(), sha);
      assert.ok(existsSync(path.join(f.releases, sha, "posts/test.mdx")));
      assert.equal(readFileSync(marker, "utf8"), before);
      assert.equal(f.search(), sha);
    } finally {
      f.cleanup();
    }
  },
);

for (const fault of ["refresh", "swap", "live"]) {
  test(
    `publication restores both content and search after ${fault} failure`,
    { skip: !linux },
    () => {
      const f = fixture();
      try {
        const old = f.publish(),
          next = f.commit();
        const result = f.run(next, fault);
        assert.notEqual(result.status, 0, result.output);
        assert.equal(f.current(), old, result.output);
        assert.equal(f.search(), old, result.output);
        assert.ok(!existsSync(f.journal));
        assert.ok(existsSync(path.join(f.releases, "current/posts/test.mdx")));
      } finally {
        f.cleanup();
      }
    },
  );
}

test(
  "failed recovery retains the journal and the next operation retries safely",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      const old = f.publish(),
        next = f.commit();
      assert.notEqual(f.run(next, "recovery").status, 0);
      assert.ok(existsSync(f.journal));
      const result = f.run("--ensure");
      assert.equal(result.status, 0, result.output);
      assert.equal(f.current(), old);
      assert.equal(f.search(), old);
      assert.ok(!existsSync(f.journal));
    } finally {
      f.cleanup();
    }
  },
);
