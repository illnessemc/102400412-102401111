const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Manage = require('./js/manage.js');
const Posts = require('./js/posts.js');

const COOKIE = 'campus-publisher';
const ASSETS = new Set(['/index.html', '/css/app.css', ...['posts', 'manage', 'home', 'search', 'detail', 'publish', 'my', 'app', 'api'].map(name => '/js/' + name + '.js')]);

function createAppHandler({ dataDir = path.join(__dirname, 'data'), seedDemo = true } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const recordsPath = path.join(dataDir, 'posts.json');
  const secretPath = path.join(dataDir, 'session.key');
  let secret;
  try { secret = fs.readFileSync(secretPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    secret = crypto.randomBytes(32);
    fs.writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 });
  }
  if (secret.length !== 32) throw new Error('发布者身份密钥格式异常，请恢复原有 session.key。');

  function signature(userId) {
    return crypto.createHmac('sha256', secret).update(userId).digest('base64url');
  }

  function identity(req, res) {
    const value = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(COOKIE + '='));
    const token = value ? value.slice(COOKIE.length + 1) : '';
    const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (match) {
      const supplied = Buffer.from(match[2], 'base64url');
      const expected = Buffer.from(signature(match[1]), 'base64url');
      if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) return match[1];
    }
    const userId = crypto.randomUUID();
    res.setHeader('Set-Cookie', COOKIE + '=' + userId + '.' + signature(userId) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000');
    return userId;
  }

  function storeFor(userId) {
    return {
      getItem(key) {
        if (key === Manage.USER_KEY) return userId;
        try { return fs.readFileSync(recordsPath, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      },
      setItem(key, value) {
        if (key !== Manage.POSTS_KEY) throw new Error('Unexpected storage key');
        const temporary = path.join(dataDir, '.posts-' + crypto.randomUUID() + '.tmp');
        try {
          fs.writeFileSync(temporary, value, { flag: 'wx' });
          fs.renameSync(temporary, recordsPath);
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
      }
    };
  }

  // Only initialize missing data by default. Explicit append preserves existing
  // records, makes a backup, and never duplicates an existing demo ID.
  if (seedDemo) {
    const store = storeFor('demo-seed');
    const current = Posts.readStoredPosts(store);
    if (current.missing || seedDemo === 'append') {
      if (!current.ok) throw new Error('演示信息未导入：数据格式异常，原有文件未被改动。');
      const additions = Posts.DEMO_POSTS.filter(post => !Posts.findPost(current.posts, post.id));
      if (additions.length) {
        if (!current.missing) fs.copyFileSync(recordsPath, path.join(dataDir, 'posts.backup-' + crypto.randomUUID() + '.json'), fs.constants.COPYFILE_EXCL);
        store.setItem(Manage.POSTS_KEY, JSON.stringify([...current.posts, ...additions]));
      }
    }
  }

  function json(res, status, result) {
    if (!result.ok) result = { ...result, errors: result.errors.map(error => error.replaceAll('浏览器存储', '服务端存储').replaceAll('本地数据', '服务端数据')) };
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  }

  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
      req.resume();
      throw Object.assign(new Error('请求必须使用 JSON 格式'), { status: 415 });
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let failed = false;
      req.on('data', chunk => {
        if (failed) return;
        size += chunk.length;
        if (size > 16384) { failed = true; reject(Object.assign(new Error('请求内容过大'), { status: 413 })); }
        else chunks.push(chunk);
      });
      req.on('end', () => {
        if (failed) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(Object.assign(new Error('请求 JSON 格式不正确'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { ok: false, errors: ['不支持该请求方法'] });
        if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== url.origin) return json(res, 403, { ok: false, errors: ['不接受跨站写入'] });
        const userId = identity(req, res);
        const store = storeFor(userId);
        if (req.method === 'GET' && pathname === '/api/session') return json(res, 200, { ok: true, userId });
        if (req.method === 'GET' && ['/api/posts', '/api/my-posts'].includes(pathname)) {
          const result = pathname === '/api/posts' ? Manage.readPosts(store) : Manage.getMyPosts(store);
          return json(res, result.ok ? 200 : 503, result);
        }
        if (req.method === 'POST' && pathname === '/api/posts') {
          const data = await body(req);
          // Read, validate and write synchronously after reading the request body;
          // concurrent requests in this single process cannot overwrite each other.
          const current = Manage.readPosts(store);
          if (!current.ok) return json(res, 503, current);
          const result = Manage.savePost(data, store);
          return json(res, result.ok ? 201 : (result.errors.some(error => error.includes('保存失败')) ? 503 : 400), result);
        }
        const match = /^\/api\/posts\/([^/]+)$/.exec(pathname);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const found = Manage.getPostById(id, store);
          if (!found.ok) return json(res, 503, found);
          if (!found.post) return json(res, 404, { ok: false, errors: ['这条信息不存在或已被删除'] });
          if (req.method === 'GET') return json(res, 200, found);
          if (found.post.ownerId !== userId) return json(res, 403, { ok: false, errors: ['只能操作本人发布的信息'] });
          if (req.method === 'PUT') {
            const data = await body(req);
            const result = Manage.updatePost(id, data, store);
            return json(res, result.ok ? 200 : (result.errors.some(error => error.includes('保存失败')) ? 503 : 400), result);
          }
          if (req.method === 'PATCH') {
            const data = await body(req);
            // Re-read after await: another request may have changed this record.
            const result = Manage.updateStatus(id, data && data.status, store);
            return json(res, result.ok ? 200 : (result.errors.some(error => error.includes('保存失败')) ? 503 : 409), result);
          }
          if (req.method === 'DELETE') {
            const result = Manage.deletePost(id, store);
            return json(res, result.ok ? 200 : 503, result);
          }
        }
        return json(res, 404, { ok: false, errors: ['接口不存在'] });
      }
      if (req.method !== 'GET') return json(res, 405, { ok: false, errors: ['不支持该请求方法'] });
      if (pathname === '/js/runtime-config.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end('window.CAMPUS_BACKEND = true;');
        return;
      }
      const asset = pathname === '/' ? '/index.html' : pathname;
      if (!ASSETS.has(asset)) return json(res, 404, { ok: false, errors: ['文件不存在'] });
      const content = fs.readFileSync(path.join(__dirname, asset.slice(1)));
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(asset)];
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
      res.end(content);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 503, { ok: false, errors: [error.status ? error.message : '服务暂时无法处理请求，请检查服务和数据文件后重试。'] });
      else res.end();
    }
  };
}

if (require.main === module) {
  const host = process.env.CAMPUS_HOST || '127.0.0.1';
  const port = Number(process.env.CAMPUS_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CAMPUS_PORT 必须是 1 到 65535 的整数。');
  const server = http.createServer(createAppHandler({ seedDemo: process.argv.includes('--seed-demo') ? 'append' : true }));
  server.on('error', error => { console.error('启动失败：' + error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log('校园失物招领已启动：http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port));
}

module.exports = { createAppHandler };
