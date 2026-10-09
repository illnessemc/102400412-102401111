const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createAppHandler } = require('../server.cjs');

function input(fields = {}) {
  return { type: 'lost', name: '共享测试雨伞', category: '雨伞', place: '图书馆', time: '2026-10-08T09:00', desc: '黑色银柄', contactType: 'wechat', contact: 'TEST_CONTACT', ...fields };
}

async function fixture(t, seedDemo = false) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-server-'));
  let server;
  let base;
  async function start() {
    server = http.createServer(createAppHandler({ dataDir, seedDemo }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() {
    if (server && server.listening) await new Promise(resolve => server.close(resolve));
  }
  function client() {
    return {
      cookie: '',
      async request(route, options = {}) {
        const headers = { ...options.headers };
        if (this.cookie) headers.Cookie = this.cookie;
        if (options.data !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(base + route, { method: options.method || 'GET', headers, body: options.data !== undefined ? JSON.stringify(options.data) : options.body });
        const cookie = response.headers.get('set-cookie');
        if (cookie) this.cookie = cookie.split(';')[0];
        return { status: response.status, headers: response.headers, result: await response.json() };
      }
    };
  }
  t.after(async () => {
    await stop();
    const target = path.resolve(dataDir);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('campus-server-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  await start();
  return { dataDir, client, start, stop, get base() { return base; } };
}

test('共享服务启动时为空，发布者身份保存在 HttpOnly 签名 Cookie', async t => {
  const app = await fixture(t);
  const a = app.client();
  const session = await a.request('/api/session');
  assert.equal(session.status, 200);
  assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await a.request('/api/session')).result.userId, session.result.userId);
  assert.deepEqual((await a.request('/api/posts')).result.posts, []);
});

test('新数据目录预置 8 条演示，覆盖两类信息、结束状态与三类联系方式', async t => {
  const app = await fixture(t, true);
  const a = app.client();
  const records = (await a.request('/api/posts')).result.posts;
  assert.equal(records.length, 8);
  assert.ok(records.every(post => post.isDemo === true && !post.ownerId));
  assert.deepEqual(new Set(records.map(post => post.type)), new Set(['lost', 'found']));
  assert.deepEqual(new Set(records.map(post => post.contactType)), new Set(['wechat', 'qq', 'phone']));
  assert.equal(records.filter(post => !['已找到', '已归还'].includes(post.status)).length, 6);
  assert.deepEqual((await a.request('/api/my-posts')).result.posts, []);
  assert.equal((await a.request('/api/posts/demo-1', { method: 'DELETE' })).status, 403);
  await a.request('/api/posts', { method: 'POST', data: input({ isDemo: true }) });
  await app.stop();
  await app.start();
  assert.equal((await a.request('/api/posts')).result.posts.length, 9);
  assert.equal((await a.request('/api/my-posts')).result.posts[0].isDemo, undefined);
});

test('默认启动保留已有空数组或损坏文件，不重复注入或覆盖数据', async t => {
  const app = await fixture(t, true);
  const filename = path.join(app.dataDir, 'posts.json');
  await app.stop();
  for (const raw of ['[]', '{broken']) {
    fs.writeFileSync(filename, raw);
    await app.start();
    assert.equal(fs.readFileSync(filename, 'utf8'), raw);
    const response = await app.client().request('/api/posts');
    assert.equal(response.status, raw === '[]' ? 200 : 503);
    await app.stop();
  }
});

test('显式追加演示保留本人信息并备份，重复追加不会重复记录', async t => {
  const app = await fixture(t);
  const a = app.client();
  const record = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  await app.stop();
  const filename = path.join(app.dataDir, 'posts.json');
  const raw = fs.readFileSync(filename, 'utf8');
  createAppHandler({ dataDir: app.dataDir, seedDemo: 'append' });
  const records = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(records.length, 9);
  assert.deepEqual(records[0], record);
  const backups = fs.readdirSync(app.dataDir).filter(name => name.startsWith('posts.backup-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(app.dataDir, backups[0]), 'utf8'), raw);
  const seeded = fs.readFileSync(filename, 'utf8');
  createAppHandler({ dataDir: app.dataDir, seedDemo: 'append' });
  assert.equal(fs.readFileSync(filename, 'utf8'), seeded);
  assert.equal(fs.readdirSync(app.dataDir).filter(name => name.startsWith('posts.backup-')).length, 1);
  await app.start();
  assert.deepEqual((await a.request('/api/my-posts')).result.posts, [record]);
});

test('显式追加遇到损坏文件时拒绝导入并保留原始数据', async t => {
  const app = await fixture(t);
  await app.stop();
  const filename = path.join(app.dataDir, 'posts.json');
  fs.writeFileSync(filename, '{broken');
  assert.throws(() => createAppHandler({ dataDir: app.dataDir, seedDemo: 'append' }), /演示信息未导入/);
  assert.equal(fs.readFileSync(filename, 'utf8'), '{broken');
});

test('甲发布，乙能浏览详情与联系方式，但我的发布按身份隔离', async t => {
  const app = await fixture(t);
  const a = app.client();
  const b = app.client();
  const saved = await a.request('/api/posts', { method: 'POST', data: input() });
  assert.equal(saved.status, 201);
  const record = saved.result.post;
  assert.equal((await b.request('/api/posts')).result.posts[0].id, record.id);
  const detail = await b.request('/api/posts/' + record.id);
  assert.equal(detail.result.post.contact, 'TEST_CONTACT');
  assert.equal(detail.result.post.contactType, 'wechat');
  assert.equal((await a.request('/api/my-posts')).result.posts.length, 1);
  assert.equal((await b.request('/api/my-posts')).result.posts.length, 0);
});

test('乙更新或删除甲的信息被服务端拒绝', async t => {
  const app = await fixture(t);
  const a = app.client();
  const b = app.client();
  const record = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  assert.equal((await b.request('/api/posts/' + record.id, { method: 'PATCH', data: { status: '已找到' } })).status, 403);
  assert.equal((await b.request('/api/posts/' + record.id, { method: 'DELETE' })).status, 403);
  assert.equal((await a.request('/api/posts/' + record.id)).result.post.status, '寻找中');
});

test('请求伪造 ownerId、id 或签名 Cookie 不能冒充发布者', async t => {
  const app = await fixture(t);
  const a = app.client();
  const b = app.client();
  const owner = (await a.request('/api/session')).result.userId;
  const record = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  const other = (await b.request('/api/posts', { method: 'POST', data: input({ ownerId: owner, id: record.id, status: '已找到' }) })).result.post;
  assert.notEqual(other.ownerId, owner);
  assert.notEqual(other.id, record.id);
  assert.equal(other.status, '寻找中');
  b.cookie = 'campus-publisher=' + owner + '.' + 'a'.repeat(43);
  assert.equal((await b.request('/api/posts/' + record.id, { method: 'DELETE' })).status, 403);
});

for (const [type, status] of [['lost', '已找到'], ['found', '已归还']]) {
  test('本人结束' + type + '后，其他发布者看到' + status + '，重复或跨类型更新被拒绝', async t => {
    const app = await fixture(t);
    const a = app.client();
    const b = app.client();
    const record = (await a.request('/api/posts', { method: 'POST', data: input({ type }) })).result.post;
    const route = '/api/posts/' + record.id;
    const wrong = status === '已找到' ? '已归还' : '已找到';
    assert.equal((await a.request(route, { method: 'PATCH', data: { status: wrong } })).status, 409);
    assert.equal((await a.request(route, { method: 'PATCH', data: { status } })).status, 200);
    assert.equal((await b.request(route)).result.post.status, status);
    assert.equal((await a.request(route, { method: 'PATCH', data: { status } })).status, 409);
  });
}

test('服务重启后，信息和原 Cookie 的所有者关系仍保持', async t => {
  const app = await fixture(t);
  const a = app.client();
  const record = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  await app.stop();
  await app.start();
  assert.equal((await a.request('/api/my-posts')).result.posts[0].id, record.id);
  assert.equal((await a.request('/api/posts/' + record.id, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await a.request('/api/posts')).result.posts, []);
});

test('本人编辑共享信息可被另一用户查询，原状态与管理字段保留', async t => {
  const app = await fixture(t);
  const a = app.client();
  const b = app.client();
  const post = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  const route = '/api/posts/' + post.id;
  const data = input({ name: '编辑后的雨伞', place: '食堂二楼', contactType: 'qq', contact: '12345678', ownerId: 'forged', status: '已找到', id: 'fake', createdAt: 'fake' });
  const edited = await a.request(route, { method: 'PUT', data });
  assert.equal(edited.status, 200);
  assert.deepEqual((await b.request(route)).result.post, { ...post, name: data.name, place: data.place, contactType: data.contactType, contact: data.contact });
  assert.equal((await b.request(route, { method: 'PUT', data })).status, 403);
  assert.equal((await b.request('/api/my-posts')).result.posts.length, 0);
});

test('共享编辑拒绝缺项、类型变更和跨站写入，已结束内容可更正', async t => {
  const app = await fixture(t);
  const a = app.client();
  const post = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  const route = '/api/posts/' + post.id;
  for (const data of [input({ name: '' }), input({ contactType: '' }), input({ type: 'found' })]) assert.equal((await a.request(route, { method: 'PUT', data })).status, 400);
  assert.equal((await a.request(route, { method: 'PUT', data: input(), headers: { Origin: 'https://example.com' } })).status, 403);
  assert.deepEqual((await a.request(route)).result.post, post);
  assert.equal((await a.request(route, { method: 'PATCH', data: { status: '已找到' } })).status, 200);
  assert.equal((await a.request(route, { method: 'PUT', data: input({ desc: '更正描述' }) })).status, 200);
  assert.equal((await a.request(route)).result.post.status, '已找到');
  assert.equal((await a.request('/api/posts/missing', { method: 'PUT', data: input() })).status, 404);
});

test('并发发布不会相互覆盖，也不会重复 ID', async t => {
  const app = await fixture(t);
  const a = app.client();
  await a.request('/api/session');
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => a.request('/api/posts', { method: 'POST', data: input({ name: '并发雨伞' + i }) })));
  assert.ok(results.every(item => item.status === 201));
  const records = (await a.request('/api/posts')).result.posts;
  assert.equal(records.length, 10);
  assert.equal(new Set(records.map(item => item.id)).size, 10);
});

test('损坏或非数组数据阻止接口读写，原始文件保留', async t => {
  const app = await fixture(t);
  const a = app.client();
  for (const raw of ['{broken', '{}', '[null]', JSON.stringify([input({ id: 'bad-type', type: ['lost'], status: '寻找中' })])]) {
    fs.writeFileSync(path.join(app.dataDir, 'posts.json'), raw);
    assert.equal((await a.request('/api/posts')).status, 503);
    assert.equal((await a.request('/api/posts', { method: 'POST', data: input() })).status, 503);
    assert.equal(fs.readFileSync(path.join(app.dataDir, 'posts.json'), 'utf8'), raw);
  }
});

test('磁盘写入失败时接口失败，旧数据没有被替换', async t => {
  const app = await fixture(t);
  const a = app.client();
  const record = (await a.request('/api/posts', { method: 'POST', data: input() })).result.post;
  const filename = path.join(app.dataDir, 'posts.json');
  const raw = fs.readFileSync(filename, 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === filename) throw new Error('Disk full'); return rename(from, to); };
  try {
    assert.equal((await a.request('/api/posts', { method: 'POST', data: input() })).status, 503);
    assert.equal((await a.request('/api/posts/' + record.id, { method: 'PATCH', data: { status: '已找到' } })).status, 503);
    assert.equal((await a.request('/api/posts/' + record.id, { method: 'PUT', data: input({ name: '更正名称' }) })).status, 503);
    assert.equal((await a.request('/api/posts/' + record.id, { method: 'DELETE' })).status, 503);
    assert.equal(fs.readFileSync(filename, 'utf8'), raw);
    assert.deepEqual(fs.readdirSync(app.dataDir).sort(), ['posts.json', 'session.key']);
  } finally { fs.renameSync = rename; }
});

test('缺参、非法 JSON、错误内容类型、过大请求和跨站写入均被拒绝', async t => {
  const app = await fixture(t);
  const a = app.client();
  assert.equal((await a.request('/api/posts', { method: 'POST', data: input({ name: '' }) })).status, 400);
  assert.equal((await a.request('/api/posts', { method: 'POST', body: '{broken', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await a.request('/api/posts', { method: 'POST', body: 'text' })).status, 415);
  assert.equal((await a.request('/api/posts', { method: 'POST', data: { desc: 'a'.repeat(20000) } })).status, 413);
  assert.equal((await a.request('/api/posts', { method: 'POST', data: input(), headers: { Origin: 'https://example.com' } })).status, 403);
  assert.deepEqual((await a.request('/api/posts')).result.posts, []);
});

test('静态入口可访问，运行配置启用后端，数据、密钥与源码配置不公开', async t => {
  const app = await fixture(t);
  assert.equal((await fetch(app.base + '/')).status, 200);
  assert.equal(await (await fetch(app.base + '/js/runtime-config.js')).text(), 'window.CAMPUS_BACKEND = true;');
  for (const route of ['/data/posts.json', '/data/session.key', '/server.cjs', '/README.md', '/.git/config']) assert.equal((await fetch(app.base + route)).status, 404);
  assert.equal((await app.client().request('/api/posts/missing')).status, 404);
});
