const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

// Runs the real pages in an isolated Chrome profile; no production browser data is used.
const root = path.resolve(__dirname, '..');
const chrome = process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');

async function browserScenarios() {
  const frame = document.querySelector('iframe');
  const results = [];
  const key = 'campus-lost-found.posts.v1';
  const payload = '<img src=x onerror="this.alt=\'XSS\'">';
  let page;
  let found;
  let lost;
  let loads = 0;
  const wait = () => new Promise(resolve => setTimeout(resolve, 30));
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const records = () => JSON.parse(page.localStorage.getItem(key) || '[]');
  const go = async route => { page.location.hash = route; await wait(); };
  const load = async route => {
    await new Promise(resolve => { frame.onload = resolve; frame.src = '/index.html?browser-test=' + (++loads) + '#' + route; });
    page = frame.contentWindow;
    await wait();
  };
  const reload = async () => {
    await new Promise(resolve => { frame.onload = resolve; page.location.reload(); });
    page = frame.contentWindow;
    await wait();
  };
  const fill = (name = '审查测试雨伞', type = 'lost') => {
    const values = { name, type, category: '雨伞', place: '图书馆 <北门>', time: '2026-10-08T09:00', contactType: 'wechat', contact: 'UI_TEST_CONTACT', desc: '用于自动化测试' };
    for (const [field, value] of Object.entries(values)) page.document.querySelector('#pub-' + field).value = value;
    page.document.querySelector('#pub-type').dispatchEvent(new page.Event('change', { bubbles: true }));
  };
  const submit = async () => { page.document.querySelector('#pub-form').requestSubmit(); await wait(); };
  const button = (id, action) => [...page.document.querySelectorAll('button[data-action]')].find(node => node.dataset.id === String(id) && node.dataset.action === action);
  async function scenario(name, run) {
    try { await run(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.message }); }
  }

  await load('publish?type=found');
  page.localStorage.clear();
  await reload();
  await scenario('直接打开发布路由会初始化表单并预选招领', async () => {
    expect(page.document.querySelector('#pub-form'), '发布表单未初始化');
    expect(page.document.querySelector('#pub-type').value === 'found', '未预选招领');
    expect(page.document.querySelector('#pub-place-label').textContent === '拾取地点 *', '招领标签错误');
  });
  await scenario('原生必填项校验阻止空表单发布', async () => {
    await submit();
    expect(page.location.hash.startsWith('#publish'), '空表单跳转成功');
    expect(page.localStorage.getItem(key) === null, '空表单写入数据');
  });

  await scenario('联系方式必须选择类型，三种选择同步输入标签且保留账号草稿', async () => {
    fill();
    const select = page.document.querySelector('#pub-contactType');
    const input = page.document.querySelector('#pub-contact');
    for (const [type, label] of [['wechat', '微信号 *'], ['qq', 'QQ 号码 *'], ['phone', '手机号 *']]) {
      select.value = type;
      select.dispatchEvent(new page.Event('change', { bubbles: true }));
      expect(page.document.querySelector('#pub-contact-label').textContent === label, '类型与标签不一致');
      expect(input.value === 'UI_TEST_CONTACT', '切换类型丢失草稿');
    }
    select.value = '';
    expect(!page.document.querySelector('#pub-form').checkValidity(), '未选择类型仍通过校验');
    await submit();
    expect(records().length === 0, '未选择类型仍保存');
    page.document.querySelector('#pub-form').reset();
  });
  await scenario('快捷入口正确预选寻物和招领，已有草稿类型也会更新', async () => {
    await go('home');
    page.document.querySelector('[data-publish-type="lost"]').click(); await wait();
    expect(page.document.querySelector('#pub-type').value === 'lost', '寻物入口错误');
    await go('home');
    page.document.querySelector('[data-publish-type="found"]').click(); await wait();
    expect(page.document.querySelector('#pub-type').value === 'found', '招领入口错误');
  });
  await scenario('发布招领成功，用户 HTML 是文字且同一次提交不会重复保存', async () => {
    fill(payload, 'found');
    const form = page.document.querySelector('#pub-form');
    form.requestSubmit();
    form.dispatchEvent(new page.Event('submit', { bubbles: true, cancelable: true }));
    await wait();
    found = records()[0];
    expect(records().length === 1, '同一次提交保存了多条');
    expect(found.status === '招领中', '招领状态错误');
    expect(page.location.hash.startsWith('#success?id='), '发布未到成功页');
    expect(page.document.querySelector('#success-content').textContent.includes(payload), '用户文字未完整显示');
    expect(!page.document.querySelector('#success-content img'), '用户 HTML 被执行');
  });
  await scenario('成功页刷新后仍定位本人记录并安全显示', async () => {
    await reload();
    expect(page.document.querySelector('#success-content').textContent.includes(payload), '刷新后成功页丢失');
    expect(!page.document.querySelector('#success-content img'), '刷新后执行了 HTML');
  });
  await scenario('再发一条清空旧表单并解除提交锁', async () => {
    page.document.querySelector('#success-content a[href="#publish"]').click(); await wait();
    expect(page.document.querySelector('#pub-name').value === '', '旧名称残留');
    expect(page.document.querySelector('#pub-contact').value === '', '旧联系方式残留');
    expect(!page.document.querySelector('#pub-submit').disabled, '提交锁没有恢复');
  });
  await scenario('发布写满失败保留输入和原始数据，可解除锁并重试', async () => {
    fill();
    const raw = page.localStorage.getItem(key);
    const original = page.Storage.prototype.setItem;
    page.Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new page.DOMException('full', 'QuotaExceededError');
      return original.call(this, name, value);
    };
    try {
      await submit();
      expect(page.location.hash === '#publish', '存储失败跳转');
      expect(!page.document.querySelector('#pub-error').hidden, '未显示错误');
      expect(page.document.querySelector('#pub-name').value === '审查测试雨伞', '失败后输入丢失');
      expect(!page.document.querySelector('#pub-submit').disabled, '失败后无法重试');
      expect(page.localStorage.getItem(key) === raw, '失败改动了旧数据');
    } finally { page.Storage.prototype.setItem = original; }
    await submit();
    lost = records().find(post => post.type === 'lost');
    expect(lost && records().length === 2, '重试未正确保存');
  });
  await scenario('首页真实数据不混入演示记录，关键词搜索可查到发布信息', async () => {
    await go('home');
    expect(page.document.querySelectorAll('#home-list .card').length === 2, '混入演示信息');
    await go('search?keyword=' + encodeURIComponent('审查测试雨伞'));
    expect(page.document.querySelectorAll('#search-list .card').length === 1, '关键词检索错误');
  });
  await scenario('直接打开和刷新我的发布，统计正确且不执行 HTML', async () => {
    await load('my');
    expect(page.document.querySelectorAll('.my-card').length === 2, '我的列表未初始化');
    expect(page.document.querySelectorAll('#my-stats strong')[0].textContent === '2', '总数错误');
    expect(!page.document.querySelector('#my-cards img'), '我的页面执行 HTML');
    await reload();
    expect(page.document.querySelectorAll('.my-card').length === 2, '我的页面刷新丢失');
  });
  await scenario('我的筛选无结果有提示，详情返回保留筛选条件', async () => {
    await go('my?filter=finished');
    expect(page.document.querySelector('#my-cards').textContent.includes('当前筛选下暂无记录'), '筛选空结果无提示');
    await go('my?filter=ongoing');
    page.document.querySelector('#my-cards a').click(); await wait();
    expect(page.document.querySelector('#detail-back').getAttribute('href') === '#my?filter=ongoing', '详情返回路径错误');
    page.document.querySelector('#detail-back').click(); await wait();
    expect(page.document.querySelector('#my-filter').value === 'ongoing', '返回丢失筛选');
  });
  await scenario('反复进入我的发布后，一次取消操作仅确认一次', async () => {
    for (let i = 0; i < 5; i++) { await go('home'); await go('my'); }
    let confirms = 0;
    page.confirm = () => { confirms++; return false; };
    button(found.id, 'finish').click(); await wait();
    expect(confirms === 1, '重复确认次数=' + confirms);
    expect(records().find(post => post.id === found.id).status === '招领中', '取消后修改了状态');
  });
  await scenario('招领标记已归还后，筛选与统计同步且条件保留', async () => {
    await go('my?filter=ongoing');
    page.confirm = () => true;
    button(found.id, 'finish').click(); await wait();
    expect(records().find(post => post.id === found.id).status === '已归还', '招领未完成');
    expect(page.document.querySelectorAll('.my-card').length === 1, '进行中筛选没有更新');
    expect(page.document.querySelector('#my-filter').value === 'ongoing', '更新丢失筛选');
    expect(page.document.querySelectorAll('#my-stats strong')[2].textContent === '1', '已结束统计错误');
  });
  await scenario('寻物标记已找到，默认搜索排除结束记录，历史查询可见', async () => {
    button(lost.id, 'finish').click(); await wait();
    expect(records().find(post => post.id === lost.id).status === '已找到', '寻物未完成');
    await go('search?keyword=' + encodeURIComponent('审查测试雨伞'));
    expect(page.document.querySelectorAll('#search-list .card').length === 0, '默认搜索包含已结束记录');
    await go('search?keyword=' + encodeURIComponent('审查测试雨伞') + '&finished=1');
    expect(page.document.querySelectorAll('#search-list .card').length === 1, '历史记录无法查到');
    page.document.querySelector('#search-list .card').click(); await wait();
    page.document.querySelector('[aria-controls="contact-panel"]').click();
    expect(page.document.querySelector('#contact-value').value === 'UI_TEST_CONTACT', '联系方式错误');
    expect(page.document.querySelector('#contact-kind').textContent === '微信号', '联系方式类型不明确');
    expect(page.document.querySelector('.notice.finished'), '已结束详情无提示');
  });
  await scenario('删除本人记录更新统计，删除最后一条保留真正空列表', async () => {
    await go('my');
    page.confirm = () => true;
    button(found.id, 'delete').click(); await wait();
    expect(records().length === 1, '删除未保存');
    expect(page.document.querySelectorAll('#my-stats strong')[0].textContent === '1', '删除后总数错误');
    button(lost.id, 'delete').click(); await wait();
    expect(records().length === 0, '最后一条未删除');
    expect(page.document.querySelector('#my-cards').textContent.includes('你还没有发布信息'), '空状态错误');
    await go('home');
    expect(page.document.querySelectorAll('#home-list .card').length === 0, '删除后补入演示信息');
  });
  await scenario('不存在或其他发布者的成功记录不能显示发布成功', async () => {
    page.localStorage.setItem(key, JSON.stringify([{ ...found, ownerId: 'other-user' }]));
    await load('success?id=' + found.id);
    expect(!page.document.querySelector('#success-content').textContent.includes('发布成功！'), '展示他人成功记录');
    await load('success?id=missing');
    expect(page.document.querySelector('#success-content').textContent.includes('不存在'), '未知 ID 显示成功');
  });
  await scenario('损坏数据提示错误，发布被拒绝且原文保留', async () => {
    page.localStorage.setItem(key, '{broken');
    await load('my');
    expect(page.document.querySelector('#my-list .form-error'), '损坏数据未提示');
    await go('publish');
    fill();
    await submit();
    expect(!page.document.querySelector('#pub-error').hidden, '损坏数据下发布无提示');
    expect(page.localStorage.getItem(key) === '{broken', '损坏原文被覆盖');
  });
  await scenario('存储访问被禁用时页面仍可操作，并显示保存失败', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(page, 'localStorage');
    Object.defineProperty(page, 'localStorage', { configurable: true, get() { throw new page.DOMException('denied', 'SecurityError'); } });
    try {
      await go('my');
      expect(page.document.querySelector('#my-list .form-error'), '禁用存储后我的页面未提示');
      await go('publish');
      fill();
      await submit();
      expect(!page.document.querySelector('#pub-error').hidden, '禁用存储后发布未提示');
      expect(!page.document.querySelector('#pub-submit').disabled, '禁用存储后按钮锁定');
    } finally { Object.defineProperty(page, 'localStorage', descriptor); }
  });
  await scenario('更新和删除写满失败时，按钮解锁且旧记录保持', async () => {
    const own = { ...lost, id: 'quota-case', status: '寻找中' };
    page.localStorage.setItem(key, JSON.stringify([own]));
    await go('my');
    page.confirm = () => true;
    const raw = page.localStorage.getItem(key);
    const original = page.Storage.prototype.setItem;
    page.Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new page.DOMException('full', 'QuotaExceededError');
      return original.call(this, name, value);
    };
    try {
      button(own.id, 'finish').click(); await wait();
      expect(!button(own.id, 'finish').disabled, '更新失败仍锁定');
      button(own.id, 'delete').click(); await wait();
      expect(!button(own.id, 'delete').disabled, '删除失败仍锁定');
      expect(page.localStorage.getItem(key) === raw, '失败修改了记录');
      expect(page.document.querySelector('#toast').textContent.includes('保存失败'), '保存失败未提示');
    } finally { page.Storage.prototype.setItem = original; }
  });
  await scenario('393px 窄屏的五个核心页面无横向溢出且底部导航可见', async () => {
    frame.style.width = '393px';
    for (const route of ['home', 'search', 'detail?id=quota-case&from=my', 'publish', 'my']) {
      await go(route);
      expect(page.document.documentElement.scrollWidth <= page.innerWidth, route + '横向溢出');
      const nav = page.document.querySelector('.bottom-nav').getBoundingClientRect();
      expect(nav.bottom <= page.innerHeight + 1 && nav.top >= 0, route + '导航不在视口');
    }
  });
  await scenario('宽屏侧边导航与分组表单正常，跳到内容不改变当前路由', async () => {
    frame.style.width = '1440px';
    await go('publish');
    const nav = page.document.querySelector('.bottom-nav').getBoundingClientRect();
    const main = page.document.querySelector('#main-content').getBoundingClientRect();
    const form = page.document.querySelector('#pub-form').getBoundingClientRect();
    const tips = page.document.querySelector('.publish-layout .context-card').getBoundingClientRect();
    expect(main.left >= nav.right - 1, '宽屏导航没有在内容左侧');
    expect(tips.left >= form.right, '发布提示没有在表单右侧');
    expect(page.document.documentElement.scrollWidth <= page.innerWidth, '宽屏发布横向溢出');
    const route = page.location.hash;
    page.document.querySelector('.skip-link').click();
    expect(page.location.hash === route, '跳到内容误触发路由');
    expect(page.document.activeElement.id === 'main-content', '焦点没有进入主要内容');
    expect(page.document.querySelector('a.nav-link[aria-current="page"]').dataset.page === 'publish', '侧边导航选中错误');
  });
  document.querySelector('#results').textContent = btoa(unescape(encodeURIComponent(JSON.stringify(results))));
  document.querySelector('#results').dataset.complete = '1';
}

test('Chrome 页面回归', { timeout: 60000 }, async t => {
  try { await fs.access(chrome); }
  catch { t.skip('未找到 Chrome；可设置 CHROME_BIN 后运行此测试。'); return; }
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'campus-lost-found-'));
  const harness = '<!doctype html><meta charset="utf-8"><iframe style="width:1000px;height:852px;border:0"></iframe><pre id="results"></pre><script>(' + browserScenarios.toString() + ')().catch(error => {document.querySelector("#results").textContent = btoa(unescape(encodeURIComponent(JSON.stringify([{name:"浏览器初始化",ok:false,error:error.message}]))));document.querySelector("#results").dataset.complete="1";});</script>';
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/__test_runner') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(harness); return; }
      const filename = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const body = await fs.readFile(filename);
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(filename)] || 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/__test_runner';
    const output = await new Promise((resolve, reject) => {
      const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--user-data-dir=' + profile, '--virtual-time-budget=15000', '--dump-dom', url], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Chrome 测试超时')); }, 45000);
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error('Chrome 退出码 ' + code + ': ' + stderr.slice(-800))); });
    });
    const match = /<pre id="results" data-complete="1">([A-Za-z0-9+/=]+)<\/pre>/.exec(output);
    if (process.env.CAMPUS_TEST_ARTIFACT_DIR) {
      await fs.mkdir(process.env.CAMPUS_TEST_ARTIFACT_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.CAMPUS_TEST_ARTIFACT_DIR, 'browser-output.html'), output);
    }
    assert.ok(match, '浏览器未完成测试：' + output.slice(0, 500));
    const results = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (process.env.CAMPUS_TEST_ARTIFACT_DIR) await fs.writeFile(path.join(process.env.CAMPUS_TEST_ARTIFACT_DIR, 'browser-results.json'), JSON.stringify(results, null, 2));
    for (const result of results) await t.test(result.name, () => assert.equal(result.ok, true, result.error));
    assert.equal(results.length, 21, '浏览器场景未全部执行');
  } finally {
    await new Promise(resolve => server.close(resolve));
    const target = path.resolve(profile);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('campus-lost-found-')) throw new Error('拒绝清理非测试目录');
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
