import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = "1".repeat(40);
const repository = "ghcr.io/example/blog";
const images = [
  `${repository}:${revision}`,
  `${repository}:${revision}-ops`,
  `${repository}:meilisearch`,
  `${repository}:nginx`,
  `${repository}:postgres`,
];
const expected = Object.fromEntries(images.map((image, i) => [image, `sha256:${String(i + 1).repeat(64)}`]));

// Exercise real shell pipelines, gzip, key parsing and cleanup. Only the network
// and Docker processes are replaced, with separate runner and server image stores.
const command = `#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const args = process.argv.slice(2);
const command = path.basename(process.argv[1]);
const stateFile = path.join(process.env.FIXTURE, 'server.json');
const expected = JSON.parse(process.env.EXPECTED);
const fail = process.env.FAIL_AT;
const record = (kind, value) => fs.appendFileSync(path.join(process.env.FIXTURE, 'events'), JSON.stringify({ kind, value }) + '\\n');
assert.equal(process.env.DEPLOY_SSH_KEY, undefined);
assert.equal(process.env.DEPLOY_KNOWN_HOSTS, undefined);
if (command === 'git') {
  assert.deepEqual(args, ['archive', process.env.GITHUB_SHA]);
  process.stdout.write('source archive');
} else if (command === 'docker') {
  const image = args.at(-1);
  if (args[0] === 'pull') {
    record('pull', image);
    assert.deepEqual(args.slice(0, 3), ['pull', '--platform', 'linux/amd64']);
    if (fail === 'pull') process.exit(1);
    assert.ok(expected[image]);
  } else if (args[1] === 'inspect') {
    process.stdout.write(args.includes('{{.Id}}') ? expected[image] : 'linux/amd64');
  } else if (args[1] === 'save') {
    record('save', args.slice(2));
    process.stdout.write(JSON.stringify(Object.fromEntries(args.slice(2).map(image => [image, expected[image]]))));
    if (fail === 'save') process.exit(1);
  } else throw new Error('Unexpected Docker command: ' + args);
} else if (command === 'ssh') {
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('IdentitiesOnly=yes'));
  const remote = args.at(-1);
  if (remote.endsWith('tar -xf -')) {
    assert.equal(fs.readFileSync(0, 'utf8'), 'source archive');
    record('archive', true);
  } else if (remote.includes('runner-images.sh list')) {
    record('inventory', true);
    if (fail === 'inventory') process.exit(1);
    const state = JSON.parse(fs.readFileSync(stateFile));
    process.stdout.write('platform\\t' + (fail === 'architecture' ? 'linux/arm64' : 'linux/amd64') + '\\n');
    for (const image of Object.keys(expected).sort()) process.stdout.write(image + '\\t' + (state[image] || 'missing') + '\\n');
  } else if (remote.includes('runner-images.sh load')) {
    const imported = JSON.parse(zlib.gunzipSync(fs.readFileSync(0)));
    record('load', imported);
    if (fail === 'load') process.exit(1);
    const state = { ...JSON.parse(fs.readFileSync(stateFile)), ...imported };
    if (fail === 'mismatch') delete state[Object.keys(expected)[0]];
    fs.writeFileSync(stateFile, JSON.stringify(state));
  } else if (remote.includes('scripts/ops/deploy.sh')) {
    assert.ok(remote.includes('BLOG_SKIP_PULL=1'));
    assert.ok(remote.endsWith("'" + process.env.GITHUB_SHA + "'"));
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)), expected);
    record('deploy', process.env.GITHUB_SHA);
    if (fail === 'deploy') process.exit(1);
  } else throw new Error('Unexpected SSH command: ' + remote);
} else throw new Error('Unexpected fixture executable');
`;

function run({ fail = "", cached = false, publicKey = false } = {}) {
  mkdirSync(path.join(root, "tmp"), { recursive: true });
  const fixture = mkdtempSync(path.join(root, "tmp", "runner-deploy-test-"));
  const bin = path.join(fixture, "bin");
  const runnerTemp = path.join(fixture, "runner temp");
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  try {
    for (const name of ["git", "docker", "ssh"]) writeFileSync(path.join(bin, name), command, { mode: 0o700 });
    const keyPath = path.join(fixture, "test-key");
    const keygen = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath], { encoding: "utf8" });
    assert.equal(keygen.status, 0, keygen.stderr);
    const initial = cached ? expected : {
      ...Object.fromEntries(images.slice(2).map(image => [image, expected[image]])),
      [images[0]]: `sha256:${"9".repeat(64)}`,
    };
    writeFileSync(path.join(fixture, "server.json"), JSON.stringify(initial));
    const result = spawnSync(process.env.RUNNER_DEPLOY_BASH || "bash", ["scripts/ops/deploy-from-runner.sh"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        FIXTURE: fixture,
        EXPECTED: JSON.stringify(expected),
        FAIL_AT: fail,
        RUNNER_TEMP: runnerTemp,
        GITHUB_SHA: revision,
        PUBLISHED_IMAGE: repository,
        DEPLOY_HOST: "server.example.invalid",
        DEPLOY_USER: "deploy",
        // Windows clipboard line endings must still form a valid private key.
        DEPLOY_SSH_KEY: readFileSync(keyPath + (publicKey ? ".pub" : ""), "utf8").replace(/\r?\n/g, "\r\n"),
        DEPLOY_KNOWN_HOSTS: "server.example.invalid ssh-ed25519 test-public-host-key\r\n",
      },
    });
    assert.ifError(result.error);
    assert.deepEqual(readdirSync(runnerTemp), [], "temporary credentials must be removed");
    assert.ok(!`${result.stdout}${result.stderr}`.includes("BEGIN OPENSSH PRIVATE KEY"));
    const events = (() => {
      try { return readFileSync(path.join(fixture, "events"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); }
      catch (error) { if (error.code === "ENOENT") return []; throw error; }
    })();
    return { ...result, events };
  } finally {
    assert.ok(fixture.startsWith(path.join(root, "tmp", "runner-deploy-test-")));
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("download on runner, transfer only changed images, verify and deploy offline", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events.filter(e => e.kind === "pull").map(e => e.value), images);
  assert.deepEqual(result.events.find(e => e.kind === "save").value, images.slice(0, 2));
  assert.equal(result.events.at(-1).kind, "deploy");
});

test("an identical server image cache avoids transfer while retaining verification", () => {
  const result = run({ cached: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.events.some(e => ["save", "load"].includes(e.kind)));
  assert.equal(result.events.at(-1).kind, "deploy");
});

for (const fail of ["inventory", "architecture", "pull", "save", "load", "mismatch"]) {
  test(`${fail} failure prevents deployment and cleans up credentials`, () => {
    const result = run({ fail });
    assert.notEqual(result.status, 0);
    assert.ok(!result.events.some(e => e.kind === "deploy"));
  });
}

test("remote deployment failure is reported to Actions", () => {
  const result = run({ fail: "deploy" });
  assert.notEqual(result.status, 0);
  assert.equal(result.events.at(-1).kind, "deploy");
});

test("a public key in DEPLOY_SSH_KEY fails before contacting the server", () => {
  const result = run({ publicKey: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEPLOY_SSH_KEY/);
  assert.deepEqual(result.events, []);
});
