#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  createReadStream,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const defaultTarget = path.join(homedir(), 'AppImages/youtube_music.appimage');

const help = `Project operator.

Usage:
  pnpm ops deploy [--target PATH] [--skip-build] [--dry-run] [--json]

deploy
  Builds an AppImage for this machine and installs it over the target.
  The replaced file is kept beside it as <target>.previous. A running app keeps
  using its old copy until restarted. Refuses a build for another architecture.

  --target PATH   AppImage to replace (default: ${defaultTarget})
  --skip-build    Install the AppImage already in pack/
  --dry-run       Report what would happen; build and install nothing
  --json          Print the result as JSON on stdout; progress goes to stderr
`;

// ELF e_machine values, from the header of the AppImage's runtime.
const elfMachines = { 40: 'armv7l', 62: 'x64', 183: 'arm64' };

const log = (message) => process.stderr.write(`${message}\n`);

const run = (command, args) => {
  log(`$ ${command} ${args.join(' ')}`);
  const { status, error } = spawnSync(command, args, {
    cwd: root,
    stdio: ['ignore', process.stderr, process.stderr],
  });
  if (error) throw error;
  if (status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${status}`);
  }
};

const capture = (command, args) =>
  spawnSync(command, args, { cwd: root, encoding: 'utf8' }).stdout.trim();

const readArch = (file) => {
  const header = Buffer.alloc(20);
  const fd = openSync(file, 'r');
  readSync(fd, header, 0, 20, 0);
  closeSync(fd);
  return elfMachines[header.readUInt16LE(18)] ?? 'unknown';
};

const sha256 = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

const findBuiltAppImage = () => {
  const pack = path.join(root, 'pack');
  const found = existsSync(pack)
    ? readdirSync(pack).filter((name) => name.endsWith('.AppImage'))
    : [];
  if (found.length !== 1) {
    throw new Error(
      `expected one AppImage in pack/, found ${found.length}: ${found.join(', ')}`,
    );
  }
  return path.join(pack, found[0]);
};

const deploy = async ({ target, skipBuild, dryRun }) => {
  const arch = process.arch === 'arm' ? 'armv7l' : process.arch;
  const previous = `${target}.previous`;
  const replaces = existsSync(target)
    ? { path: target, arch: readArch(target), keptAs: previous }
    : null;
  const commit = capture('git', ['rev-parse', '--short', 'HEAD']);
  const dirty = capture('git', ['status', '--porcelain']) !== '';

  if (dryRun) {
    return { dryRun, target, arch, commit, dirty, skipBuild, replaces };
  }

  if (!skipBuild) {
    run('pnpm', ['clean']);
    run('pnpm', ['build']);
    run('pnpm', [
      'electron-builder',
      '--linux',
      `AppImage:${arch}`,
      '-p',
      'never',
    ]);
  }

  const built = findBuiltAppImage();
  const builtArch = readArch(built);
  if (builtArch !== arch) {
    throw new Error(`${built} is ${builtArch}, this machine is ${arch}`);
  }

  // Rename into place so a running copy keeps its file and the target is never partial.
  const incoming = `${target}.new`;
  copyFileSync(built, incoming);
  chmodSync(incoming, 0o755);
  if (replaces) renameSync(target, previous);
  renameSync(incoming, target);

  const installedSha256 = await sha256(target);
  if (installedSha256 !== (await sha256(built))) {
    throw new Error(`${target} does not match ${built}`);
  }

  return {
    dryRun,
    target,
    arch: readArch(target),
    commit,
    dirty,
    built,
    sizeBytes: statSync(target).size,
    sha256: installedSha256,
    replaces,
    runningCopies: Number(capture('pgrep', ['-fc', `^${target}`])),
  };
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'target': { type: 'string', default: defaultTarget },
    'skip-build': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'json': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length === 0) {
  process.stdout.write(help);
} else if (positionals[0] !== 'deploy') {
  log(`Unknown command: ${positionals[0]}\n\n${help}`);
  process.exitCode = 2;
} else {
  try {
    const result = await deploy({
      target: path.resolve(values.target),
      skipBuild: values['skip-build'],
      dryRun: values['dry-run'],
    });
    process.stdout.write(
      values.json
        ? `${JSON.stringify(result)}\n`
        : `${JSON.stringify(result, null, 2)}\n`,
    );
  } catch (error) {
    log(`deploy failed: ${error.message}`);
    process.exitCode = 1;
  }
}
