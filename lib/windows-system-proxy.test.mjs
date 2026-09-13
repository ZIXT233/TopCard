import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
const { parseWindowsProxy, applySystemProxyEnvironment } = await createJiti(import.meta.url).import('./windows-system-proxy.ts');
const settings = (server, enabled = '0x1') => `\n ProxyEnable REG_DWORD ${enabled}\n ProxyServer REG_SZ ${server}\n ProxyOverride REG_SZ *.example.test;localhost;<local>\n`;
test('Windows system proxy supports shared and per-protocol settings and bypasses loopback', () => {
  const shared = parseWindowsProxy(settings('127.0.0.1:7890'));
  assert.equal(shared.httpProxy, 'http://127.0.0.1:7890/');
  assert.equal(shared.httpsProxy, shared.httpProxy);
  assert.match(shared.noProxy, /127\.0\.0\.1/);
  assert.match(shared.noProxy, /\*\.example\.test/);
  assert.doesNotMatch(shared.noProxy, /<local>/);
  const protocols = parseWindowsProxy(settings('http=localhost:80;https=localhost:81'));
  assert.equal(protocols.httpProxy, 'http://localhost/');
  assert.equal(protocols.httpsProxy, 'http://localhost:81/');
  assert.deepEqual(parseWindowsProxy(settings('127.0.0.1:7890', '0x0')), {});
});
test('system defaults reach child CLIs without overriding explicit environment preferences', () => {
  const proxy = parseWindowsProxy(settings('127.0.0.1:7890'));
  const env = { https_proxy: 'http://custom:99', NO_PROXY: '*' };
  applySystemProxyEnvironment(proxy, env);
  assert.equal(env.HTTP_PROXY, proxy.httpProxy);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.https_proxy, 'http://custom:99');
  assert.equal(env.NO_PROXY, '*');
  const explicitHttp = { HTTP_PROXY: 'http://custom:88' };
  applySystemProxyEnvironment(proxy, explicitHttp);
  assert.equal(explicitHttp.HTTPS_PROXY, 'http://custom:88');
});
