import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { configHosts, listHosts, savedHosts, setConfigHostVisibility, updateHost } = await jiti.import('./remote-hosts.ts');
const { connectSsh, connectionArgs, sshError, createSshTempDirectory } = await jiti.import('./ssh-connection.ts');

test('SSH config imports concrete aliases, connection settings and Include files, excludes patterns and cycles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cq-config-'));
  try {
    await writeFile(join(root, 'extra'), `Host second third\n  HostName 10.0.0.9\n  User dev\n  Port 2202\nInclude ${root}/config\n`);
    await writeFile(join(root, 'config'), `Host first wildcard-* !excluded * # comment\n  HostName first.example.com\n  User root\nInclude "${root}/extra"\n`);
    const hosts = await configHosts(join(root, 'config'));
    assert.deepEqual(hosts.map(h => h.id), ['first', 'second', 'third']);
    assert.deepEqual(hosts.map(({ id, hostname, user, port }) => ({ id, hostname, user, port })), [
      { id: 'first', hostname: 'first.example.com', user: 'root', port: undefined },
      { id: 'second', hostname: '10.0.0.9', user: 'dev', port: 2202 },
      { id: 'third', hostname: '10.0.0.9', user: 'dev', port: 2202 },
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('host store validates input, serializes changes and never stores passwords', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cq-hosts-')), cwd = process.cwd();
  process.chdir(root);
  try {
    await assert.rejects(updateHost({ name: 'bad', hostname: '-oProxyCommand=evil' }));
    await assert.rejects(updateHost({ name: 'bad', hostname: 'host', port: 0 }));
    const [one, two] = await Promise.all([updateHost({ name: 'one', hostname: 'example.com', user: 'dev', port: 2222, password: 'not-saved' }), updateHost({ name: 'two', hostname: 'localhost' })]);
    assert.equal((await savedHosts()).length, 2);
    assert.ok(!(await readFile(join(root, '.topcard/remote-hosts.json'), 'utf8')).includes('not-saved'));
    const args = await connectionArgs(one.id);
    assert.equal(args[0], '-T');
    assert.deepEqual(args.slice(-5), ['-p', '2222', '-l', 'dev', 'example.com']);
    const interactiveArgs = await connectionArgs(one.id, { requestTty: true });
    assert.equal(interactiveArgs[0], '-tt');
    assert.equal(interactiveArgs.includes('-T'), false);
    await updateHost({ ...one, hostname: 'new.example.com' });
    assert.equal((await savedHosts()).find(h => h.id === one.id).hostname, 'new.example.com');
    await updateHost({ id: two.id }, true);
    await assert.rejects(connectionArgs(two.id), e => e.code === 'HOST_DELETED');
    assert.equal((await savedHosts()).length, 1);
  } finally { process.chdir(cwd); await rm(root, { recursive: true, force: true }); }
});

test('each SSH config host persists its own visibility', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cq-host-visibility-')), cwd = process.cwd();
  const config = join(root, 'config');
  process.chdir(root);
  try {
    await writeFile(config, 'Host alpha beta\n');
    assert.deepEqual((await listHosts(config)).map(host => [host.id, host.visible]), [['alpha', true], ['beta', true]]);
    await setConfigHostVisibility('alpha', false, config);
    assert.deepEqual((await listHosts(config)).map(host => [host.id, host.visible]), [['alpha', false], ['beta', true]]);
    await setConfigHostVisibility('alpha', true, config);
    assert.deepEqual((await listHosts(config)).map(host => [host.id, host.visible]), [['alpha', true], ['beta', true]]);
  } finally { process.chdir(cwd); await rm(root, { recursive: true, force: true }); }
});

test('askpass sends password via private IPC; trust requires the exact displayed fingerprint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cq-auth-')), previous = process.env.PATH;
  try {
    await mkdir(join(root, 'bin'));
    await writeFile(join(root, 'bin/ssh'), `#!/bin/sh
case " $* " in *" -O "*) exit 1;; esac
if [ "$CQ_TEST_TRUST" = yes ]; then
  reply=$("$SSH_ASKPASS" 'Are you sure you want to continue connecting (yes/no/[fingerprint])? SHA256:fixture')
  [ "$reply" = yes ] || { echo 'Host key verification failed' >&2; exit 255; }
else
  reply=$("$SSH_ASKPASS" "dev@fixture password:")
  [ "$reply" = 'fixture-secret' ] || { echo 'Permission denied' >&2; exit 255; }
fi
`, { mode: 0o700 });
    process.env.PATH = `${root}/bin:${previous}`;
    await assert.rejects(connectSsh('fixture'), e => sshError(e).code === 'AUTH_REQUIRED');
    await connectSsh('fixture', 'fixture-secret');
    process.env.CQ_TEST_TRUST = 'yes';
    let prompt;
    await assert.rejects(connectSsh('fixture'), e => { const error = sshError(e); prompt = error.prompt; return error.code === 'HOST_TRUST_REQUIRED'; });
    await assert.rejects(connectSsh('fixture', undefined, 'wrong fingerprint'));
    await connectSsh('fixture', undefined, prompt);
  } finally { process.env.PATH = previous; delete process.env.CQ_TEST_TRUST; await rm(root, { recursive: true, force: true }); }
});

// Exercise actual sockaddr_un binding, including OpenSSH's appended random suffix.
test('short private socket paths work even with a long macOS TMPDIR', async () => {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = '/var/folders/' + 'long-macos-temp-path'.repeat(8) + '/T';
  let privateDir;
  try {
    privateDir = await createSshTempDirectory();
    assert.equal((await stat(privateDir)).mode & 0o777, 0o700);
    const args = await connectionArgs('socket-regression');
    const path = args[args.indexOf('-S') + 1] + '.nZN4aVAtLqQEG9mt';
    assert.ok(Buffer.byteLength(path) < 104, path);
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    await new Promise(resolve => server.close(resolve));
  } finally {
    if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous;
    if (privateDir) await rm(privateDir, { recursive: true, force: true });
  }
});

test('SSH failures return stable codes without leaking command lines or temp paths', () => {
  const response = sshError(new Error('Command failed: ssh -M -S /var/private-path unix_listener: path too long for Unix domain socket'));
  assert.equal(response.code, 'SOCKET_PATH');
  assert.ok(!JSON.stringify(response).includes('/var/'));
  assert.equal(sshError(new Error('Connection timed out')).code, 'TIMEOUT');
});
