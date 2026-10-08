const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createAppHandler } = require('../server.cjs');
const chrome = process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');

async function sharedScenarios(mode) {
  const frame = document.querySelector('iframe');
  const results = [];
  const payload = '共享雨伞 <img src=x onerror="this.alt=\'XSS\'">';
  const keyword = encodeURIComponent('共享雨伞');
  let page;
  let loads = 0;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 30));
  async function until(check) {
    for (let i = 0; i < 300; i++) { if (check()) return; await pause(); }
    throw new Error('页面操作未完成');
  }
  async function go(route) {
    page.CampusUI.navigate(route);
    await until(() => !page.document.querySelector('#source-note').textContent.includes('正在加载'));
    await pause();
  }
  async function load(route) {
    await new Promise(resolve => { frame.onload = resolve; frame.src = '/index.html?shared-test=' + (++loads) + '#' + route; });
    page = frame.contentWindow;
    await until(() => page.CampusApi && !page.document.querySelector('#source-note').textContent.includes('正在加载'));
    await pause();
  }
  async function check(name, run) {
    try { await run(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.message }); }
  }

  if (mode === 'publish') {
    await load('publish?type=found');
    await check('服务模式正确启用，首次为空且没有演示数据', async () => {
      expect(page.CampusApi.enabled, '服务模式未启用');
      expect((await (await fetch('/api/posts')).json()).posts.length === 0, '服务不是空数据');
      expect(page.document.querySelector('#pub-type').value === 'found', '招领预选错误');
    });
    await check('断线发布失败保留输入，恢复后保存一次且不执行 HTML', async () => {
      const values = { type: 'found', name: payload, category: '雨伞', place: '共享图书馆', time: '2026-10-08T09:00', contactType: 'qq', contact: '00000000', desc: '共享测试记录' };
      for (const [field, value] of Object.entries(values)) page.document.querySelector('#pub-' + field).value = value;
      const nativeFetch = page.fetch;
      page.fetch = () => Promise.reject(new Error('offline'));
      page.document.querySelector('#pub-form').requestSubmit();
      await until(() => !page.document.querySelector('#pub-error').hidden);
      expect(page.document.querySelector('#pub-name').value === payload, '断线后输入丢失');
      expect(!page.document.querySelector('#pub-submit').disabled, '断线后锁定');
      expect(page.localStorage.getItem('campus-lost-found.posts.v1') === null, '断线时误存到本机');
      page.fetch = nativeFetch;
      const form = page.document.querySelector('#pub-form');
      form.requestSubmit();
      form.dispatchEvent(new page.Event('submit', { bubbles: true, cancelable: true }));
      await until(() => page.location.hash.startsWith('#success') && page.document.querySelector('#success-content').textContent.includes('发布成功！'));
      expect(page.document.querySelector('#success-content').textContent.includes(payload), '成功页文字错误');
      expect(!page.document.querySelector('#success-content img'), '执行了用户 HTML');
      expect((await (await fetch('/api/posts')).json()).posts.length === 1, '一次提交保存多条');
    });
    await check('服务成功页与本人列表刷新后仍保留，并在读失败时不补演示信息', async () => {
      await load(page.location.hash.slice(1));
      expect(page.document.querySelector('#success-content').textContent.includes(payload), '刷新成功页丢失');
      await go('my');
      await until(() => page.document.querySelectorAll('.my-card').length === 1);
      expect(!page.document.querySelector('#my-cards img'), '本人列表执行 HTML');
      const nativeFetch = page.fetch;
      page.fetch = () => Promise.reject(new Error('offline'));
      await go('home');
      expect(page.document.querySelector('#source-note').textContent.includes('无法连接'), '读取失败无提示');
      expect(page.document.querySelectorAll('#home-list .card').length === 0, '读取失败补入演示信息');
      page.fetch = nativeFetch;
      await go('home');
      expect(page.document.querySelectorAll('#home-list .card').length === 1, '恢复连接后未刷新');
    });
  } else if (mode === 'view') {
    await load('home');
    await check('另一浏览器能浏览、搜索并查看甲发布的信息及联系方式', async () => {
      expect(page.document.querySelectorAll('#home-list .card').length === 1, '另一浏览器看不到发布');
      await go('search?keyword=' + keyword);
      page.document.querySelector('#search-list .card').click();
      await until(() => page.document.querySelector('[aria-controls="contact-panel"]'));
      page.document.querySelector('[aria-controls="contact-panel"]').click();
      expect(page.document.querySelector('#contact-value').value === '00000000', '共享联系方式错误');
      expect(page.document.querySelector('#contact-kind').textContent === 'QQ 号码', '共享联系方式类型不明确');
    });
    await check('乙的我的发布为空，没有甲的管理按钮', async () => {
      await go('my');
      await until(() => page.document.querySelector('#my-cards'));
      expect(page.document.querySelectorAll('.my-card').length === 0, '乙拥有甲的记录');
      expect(!page.document.querySelector('button[data-action]'), '乙能管理甲的记录');
    });
  } else if (mode === 'finish') {
    await load('my');
    await check('原浏览器重启后仍拥有记录，标记招领为已归还', async () => {
      await until(() => page.document.querySelector('button[data-action="finish"]'));
      page.confirm = () => true;
      page.document.querySelector('button[data-action="finish"]').click();
      await until(() => page.document.querySelector('#my-stats') && page.document.querySelectorAll('#my-stats strong')[2].textContent === '1');
      expect((await (await fetch('/api/posts')).json()).posts[0].status === '已归还', '服务状态未更新');
    });
  } else if (mode === 'history') {
    await load('search?keyword=' + keyword);
    await check('乙重新查询能看到最新结束状态，默认排除但历史可查', async () => {
      expect(page.document.querySelectorAll('#search-list .card').length === 0, '默认包含已归还');
      await go('search?keyword=' + keyword + '&finished=1');
      expect(page.document.querySelector('#search-list').textContent.includes('已归还'), '乙看不到新状态');
    });
  } else if (mode === 'delete') {
    await load('my');
    await check('本人删除最后一条共享记录后，服务保持空列表', async () => {
      await until(() => page.document.querySelector('button[data-action="delete"]'));
      page.confirm = () => true;
      page.document.querySelector('button[data-action="delete"]').click();
      await until(() => page.document.querySelector('#my-stats') && page.document.querySelectorAll('#my-stats strong')[0].textContent === '0');
      expect((await (await fetch('/api/posts')).json()).posts.length === 0, '服务没有删除记录');
    });
  }
  document.querySelector('#results').textContent = btoa(unescape(encodeURIComponent(JSON.stringify(results))));
  document.querySelector('#results').dataset.complete = '1';
}

test('Chrome 两个独立发布者的共享流程', { timeout: 120000 }, async t => {
  try { await fs.access(chrome); }
  catch { t.skip('未找到 Chrome；可设置 CHROME_BIN。'); return; }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'campus-shared-'));
  if (process.env.CAMPUS_TEST_ARTIFACT_DIR) await fs.mkdir(process.env.CAMPUS_TEST_ARTIFACT_DIR, { recursive: true });
  const app = createAppHandler({ dataDir: path.join(directory, 'data') });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/__shared_test') { app(req, res); return; }
    const mode = url.searchParams.get('mode');
    const harness = '<!doctype html><meta charset="utf-8"><iframe style="width:1000px;height:852px;border:0"></iframe><pre id="results"></pre><script>(' + sharedScenarios.toString() + ')(' + JSON.stringify(mode) + ').catch(error=>{document.querySelector("#results").textContent=btoa(unescape(encodeURIComponent(JSON.stringify([{name:"共享页面初始化",ok:false,error:error.message}]))));document.querySelector("#results").dataset.complete="1";});</script>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(harness);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const all = [];
    for (const [actor, mode] of [['a', 'publish'], ['b', 'view'], ['a', 'finish'], ['b', 'history'], ['a', 'delete']]) {
      const output = await new Promise((resolve, reject) => {
        const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--user-data-dir=' + path.join(directory, actor), '--virtual-time-budget=20000', '--window-size=1040,1000', '--dump-dom'];
        if (mode === 'publish' && process.env.CAMPUS_TEST_ARTIFACT_DIR) args.push('--screenshot=' + path.join(process.env.CAMPUS_TEST_ARTIFACT_DIR, 'shared-home.png'));
        args.push('http://127.0.0.1:' + server.address().port + '/__shared_test?mode=' + mode);
        const child = spawn(chrome, args, { windowsHide: true });
        let stdout = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('共享浏览器测试超时')); }, 30000);
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.resume();
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error('Chrome 退出码 ' + code)); });
      });
      const match = /<pre id="results" data-complete="1">([A-Za-z0-9+/=]+)<\/pre>/.exec(output);
      assert.ok(match, '共享流程未完成：' + mode);
      const results = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
      all.push(...results);
      for (const result of results) await t.test(result.name, () => assert.equal(result.ok, true, result.error));
    }
    assert.equal(all.length, 8);
    if (process.env.CAMPUS_TEST_ARTIFACT_DIR) {
      await fs.mkdir(process.env.CAMPUS_TEST_ARTIFACT_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.CAMPUS_TEST_ARTIFACT_DIR, 'shared-browser-results.json'), JSON.stringify(all, null, 2));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('campus-shared-'));
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
