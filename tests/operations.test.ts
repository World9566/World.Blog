import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseOperations } from "../src/lib/operations";

const linux = process.platform === "linux";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "blog-operations-test-"));
  const state = path.join(root, ".deploy/world-blog-ops-test");
  const backups = path.join(root, "backups/world-blog-ops-test");
  const content = path.join(root, "content/releases");
  for (const dir of ["scripts/ops", state, backups, `${content}/empty/posts`])
    mkdirSync(path.resolve(root, dir), { recursive: true });
  for (const name of [
    "common.sh",
    "operations-common.sh",
    "monitor.sh",
    "backup.sh",
    "backup-cycle.sh",
    "backup-prune.sh",
    "setup-operations.sh",
  ])
    copyFileSync(`scripts/ops/${name}`, path.join(root, "scripts/ops", name));
  mkdirSync(path.join(root, "deploy"));
  for (const name of [
    "world-blog-backup.service",
    "world-blog-backup.timer",
    "world-blog-monitor.service",
    "world-blog-monitor.timer",
  ])
    copyFileSync(`deploy/${name}`, path.join(root, "deploy", name));
  copyFileSync(".env.ops.example", path.join(root, ".env.ops.example"));
  writeFileSync(
    path.join(root, ".env.production"),
    `COMPOSE_PROJECT_NAME=world-blog-ops-test\nSITE_URL=https://test.example.invalid\nSITE_HOST=test.example.invalid\nBLOG_IMAGE=test/blog\nBLOG_RELEASE=${"2".repeat(40)}\nPOSTGRES_PASSWORD=${"a".repeat(64)}\nCONTENT_ROOT=${root}/content\n`,
  );
  writeFileSync(path.join(state, "current-release"), "1".repeat(40));
  writeFileSync(path.join(content, "empty/posts/test.mdx"), "test article");
  writeFileSync(path.join(content, "empty/.git"), "private git pointer");
  symlinkSync("empty", path.join(content, "current"));
  writeFileSync(
    path.join(root, "bash-env"),
    `
docker() {
  case "$1" in
    info) [[ "$TEST_FAULT" != docker ]] ;;
    ps) printf 'abcdef012345\\n' ;;
    inspect) if [[ "$TEST_FAULT" == health ]]; then echo 'running unhealthy'; else echo 'running healthy'; fi ;;
    compose)
      if [[ "$*" == *pg_dump* ]]; then [[ "$TEST_FAULT" != dump ]] && echo 'disposable dump'
      elif [[ "$*" == *'pg_restore --list'* ]]; then cat >/dev/null
      elif [[ "$*" == *psql* ]]; then read -r sql; if [[ "$sql" == *to_regclass* ]]; then echo t; else echo 3; fi
      else return 9; fi ;;
    *) return 9 ;;
  esac
}
sudo() { return 1; }
curl() {
  if [[ "$TEST_FAULT" == network ]]; then return 7; fi
  if [[ "$*" == *http_code* ]]; then echo 200; fi
}
df() { printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 10000000 100 9000000 1%% /\\n'; }
# timeout cannot execute exported functions itself; retain the bound in real
# scripts while replacing only the external services at this test boundary.
timeout() { [[ "$1" != --kill-after=* ]] || shift; shift; "$@"; }
export -f docker sudo curl df timeout
`,
  );
  const run = (script: string, args: string[] = [], fault = "") => {
    const result = spawnSync(
      "bash",
      [path.join(root, "scripts/ops", script), ...args],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          BLOG_ENV_FILE: path.join(root, ".env.production"),
          BLOG_OPS_ENV_FILE: path.join(root, ".env.ops"),
          BLOG_OPERATION_LOCK_HELD: "0",
          BASH_ENV: path.join(root, "bash-env"),
          TEST_ROOT: root,
          TEST_FAULT: fault,
        },
      },
    );
    return { ...result, output: result.stdout + result.stderr };
  };
  return {
    root,
    state,
    backups,
    run,
    report: () =>
      JSON.parse(
        readFileSync(path.join(state, "operations/status.json"), "utf8"),
      ),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test(
  "timed pulls terminate their CLI and release the lock with direct Docker or sudo",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      writeFileSync(
        path.join(f.root, "fake-docker"),
        `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$$" > "$TEST_ROOT/pull.pid"
printf '%s\\n' "$@" > "$TEST_ROOT/pull.args"
[[ "$TEST_FAULT" != failure ]] || exit 23
exec sleep 60
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(f.root, "fake-sudo"),
        `#!/usr/bin/env bash
set -eu
[[ "$1" == -n ]]; shift
printf '%s\\n' "$@" > "$TEST_ROOT/sudo.args"
exec "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(f.root, "scripts/ops/timed-pull.sh"),
        `#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "$0")/common.sh"
lock_operation
# Use GNU timeout itself, not the monitor test double.
unset -f timeout
DOCKER=("$ROOT/fake-docker")
[[ "$TEST_FAULT" != sudo ]] || DOCKER=("$ROOT/fake-sudo" -n "$ROOT/fake-docker")
dc_with_timeout 1s pull postgres meilisearch gateway web ops
`,
      );
      for (const mode of ["direct", "sudo", "failure"]) {
        const result = f.run("timed-pull.sh", [], mode);
        assert.equal(
          result.status,
          mode === "failure" ? 23 : 124,
          result.output,
        );
        assert.equal(existsSync(path.join(f.state, "operation.lock")), false);
        assert.equal(
          readdirSync(f.state).some((name) =>
            name.startsWith("compose-release."),
          ),
          false,
        );
        const pid = Number(readFileSync(path.join(f.root, "pull.pid"), "utf8"));
        assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
        assert.match(
          readFileSync(path.join(f.root, "pull.args"), "utf8"),
          /pull\npostgres\nmeilisearch\ngateway\nweb\nops\n$/,
        );
      }
      assert.match(
        readFileSync(path.join(f.root, "sudo.args"), "utf8"),
        /^timeout\n--signal=TERM\n--kill-after=15s\n1s\n/,
      );
    } finally {
      f.cleanup();
    }
  },
);

test(
  "monitor confirms failures, records one incident/recovery and keeps running without Docker",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      writeFileSync(
        path.join(f.state, "backup-result"),
        `${Math.floor(Date.now() / 1000)} 0\n`,
      );
      writeFileSync(
        path.join(f.backups, "sample.dump.complete"),
        `${Math.floor(Date.now() / 1000)}\n`,
      );
      for (const suffix of ["", ".env", ".meta", ".sha256"])
        writeFileSync(path.join(f.backups, "sample.dump" + suffix), "test");
      assert.equal(f.run("monitor.sh").status, 0);
      assert.equal(parseOperations(f.report()).status, "ok");
      for (let i = 0; i < 2; i++) {
        const result = f.run("monitor.sh", [], "network");
        assert.equal(result.status, 0, result.output);
        assert.equal(
          f.report().checks.find((c: { id: string }) => c.id === "origin")
            .status,
          "pending",
        );
        assert.equal(f.report().events.length, 0);
      }
      assert.equal(f.run("monitor.sh", [], "network").status, 0);
      assert.equal(f.report().events.length, 2);
      assert.equal(f.run("monitor.sh", [], "network").status, 0);
      assert.equal(f.report().events.length, 2);
      assert.equal(f.run("monitor.sh").status, 0);
      assert.equal(f.report().events.length, 4);
      assert.equal(parseOperations(f.report()).status, "ok");
      assert.equal(f.run("monitor.sh", [], "docker").status, 0);
      assert.equal(
        f.report().checks.find((c: { id: string }) => c.id === "containers")
          .status,
        "pending",
      );
      assert.equal(
        parseOperations(f.report(), Date.now() + 360000).status,
        "stale",
      );
      f.report().events.forEach((event: object) =>
        assert.deepEqual(Object.keys(event).sort(), ["at", "check", "status"]),
      );
    } finally {
      f.cleanup();
    }
  },
);

test(
  "operations configuration cannot execute code and rejects unsafe retention",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      for (const config of [
        "BACKUP_KEEP_DAYS=0\n",
        "BACKUP_KEEP_MIN=0\n",
        "MONITOR_FAILURES=0\n",
        "BACKUP_KEEP_DAYS=$(touch hacked)\n",
        "UNKNOWN=1\n",
      ]) {
        writeFileSync(path.join(f.root, ".env.ops"), config);
        assert.notEqual(f.run("monitor.sh").status, 0);
        assert.equal(existsSync(path.join(f.root, "hacked")), false);
      }
    } finally {
      f.cleanup();
    }
  },
);

test(
  "backup records the active app/content and publishes completeness only after success",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      const result = f.run("backup.sh");
      assert.equal(result.status, 0, result.output);
      const backup = result.stdout.trim();
      assert.match(
        readFileSync(`${backup}.meta`, "utf8"),
        new RegExp(`release=${"1".repeat(40)}`),
      );
      assert.match(readFileSync(`${backup}.meta`, "utf8"), /content=empty/);
      assert.ok(existsSync(`${backup}.env.sha256`));
      assert.ok(existsSync(`${backup}.complete`));
      const tar = spawnSync("tar", ["-tzf", `${backup}.content.tar.gz`], {
        encoding: "utf8",
      });
      assert.equal(tar.status, 0);
      assert.match(tar.stdout, /posts\/test.mdx/);
      assert.doesNotMatch(tar.stdout, /\.git/);
      const failed = f.run("backup.sh", [], "dump");
      assert.notEqual(failed.status, 0);
      assert.equal(
        readdirSync(f.backups).filter((name) => name.endsWith(".complete"))
          .length,
        1,
      );
      assert.match(
        readFileSync(path.join(f.state, "backup-result"), "utf8"),
        / 1\n$/,
      );
      assert.equal(existsSync(path.join(f.state, "operation.lock")), false);
    } finally {
      f.cleanup();
    }
  },
);

test(
  "retention previews first, keeps the minimum sets and never follows unrelated paths",
  { skip: !linux },
  () => {
    const f = fixture();
    try {
      writeFileSync(
        path.join(f.root, ".env.ops"),
        "BACKUP_KEEP_DAYS=1\nBACKUP_KEEP_MIN=2\n",
      );
      const names = [1, 2, 3, 4].map(
        (day) => `2026010${day}T043000Z-test${day}.dump`,
      );
      for (const name of names) {
        for (const suffix of ["", ".meta", ".env", ".sha256"])
          writeFileSync(path.join(f.backups, name + suffix), "test");
        writeFileSync(path.join(f.backups, name + ".complete"), "1\n");
      }
      writeFileSync(path.join(f.backups, "unrelated.dump"), "keep");
      const outside = path.join(f.root, "outside.dump");
      writeFileSync(outside, "keep outside backup directory");
      const linked = path.join(f.backups, "20250101T043000Z-linked.dump");
      symlinkSync(outside, linked);
      for (const suffix of [".meta", ".env", ".sha256", ".complete"])
        writeFileSync(linked + suffix, "1\n");
      const preview = f.run("backup-prune.sh");
      assert.equal(preview.status, 0, preview.output);
      assert.ok(names.every((name) => existsSync(path.join(f.backups, name))));
      const apply = f.run("backup-prune.sh", ["--apply"]);
      assert.equal(apply.status, 0, apply.output);
      assert.ok(
        names
          .slice(0, 2)
          .every((name) => !existsSync(path.join(f.backups, name))),
      );
      assert.ok(
        names.slice(2).every((name) => existsSync(path.join(f.backups, name))),
      );
      assert.ok(existsSync(path.join(f.backups, "unrelated.dump")));
      assert.equal(
        readFileSync(outside, "utf8"),
        "keep outside backup directory",
      );
      assert.ok(existsSync(linked));
    } finally {
      f.cleanup();
    }
  },
);

test("operations API parser rejects malformed data and strips internal fields", () => {
  const report = {
    version: 1,
    checkedAt: "2026-09-27T01:00:00Z",
    privatePath: "/secret",
    checks: [
      "containers",
      "origin",
      "public",
      "disk",
      "backup_age",
      "backup_job",
    ].map((id) => ({
      id,
      status: "ok",
      failures: 0,
      since: 1,
      secret: "hidden",
    })),
    events: [],
  };
  const parsed = parseOperations(report, Date.parse(report.checkedAt));
  assert.equal(parsed.status, "ok");
  assert.doesNotMatch(JSON.stringify(parsed), /secret|hidden/);
  assert.throws(() => parseOperations({ ...report, checks: [] }));
  assert.throws(() =>
    parseOperations({ ...report, events: Array(201).fill({}) }),
  );
  assert.equal(parseOperations(report, 0).status, "stale");
});

test(
  "setup renders the deployment user and preserves existing private settings",
  { skip: !linux || process.getuid?.() === 0 },
  () => {
    const f = fixture();
    try {
      const result = f.run("setup-operations.sh");
      assert.equal(result.status, 0, result.output);
      const units = path.join(f.state, "operations-state/units");
      assert.match(
        readFileSync(path.join(units, "world-blog-monitor.service"), "utf8"),
        new RegExp(`WorkingDirectory=${f.root}`),
      );
      assert.ok(existsSync(path.join(f.root, ".env.ops")));
      const privateSettings = "BACKUP_KEEP_DAYS=20\n";
      writeFileSync(path.join(f.root, ".env.ops"), privateSettings);
      assert.equal(f.run("setup-operations.sh").status, 0);
      assert.equal(
        readFileSync(path.join(f.root, ".env.ops"), "utf8"),
        privateSettings,
      );
    } finally {
      f.cleanup();
    }
  },
);
