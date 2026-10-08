const test = require('node:test');
const assert = require('node:assert/strict');
const Posts = require('../js/posts.js');
const Detail = require('../js/detail.js');

function post(fields = {}) {
  return { id: 'test-1', type: 'lost', name: '黑色雨伞', category: '雨伞', place: '图书馆', time: '2026-10-06T08:00', createdAt: '2026-10-07T09:00:00+08:00', status: '寻找中', desc: '银色伞柄', contact: '微信：test', ...fields };
}

function storage(value) {
  return { getItem(key) { assert.equal(key, Posts.STORAGE_KEY); return value; }, setItem() { assert.fail('Reading data must never write to storage'); } };
}

test('首页只展示进行中的寻物和招领信息', () => {
  const records = [post(), post({ id: 2, status: '已找到' }), post({ id: 3, type: 'found', status: '招领中' }), post({ id: 4, type: 'found', status: '已归还' })];
  assert.deepEqual(Posts.filterPosts(records).map(p => p.id), ['test-1', 3]);
});

test('信息类型筛选排除另一类信息', () => {
  const records = [post(), post({ id: 2, type: 'found', status: '招领中' })];
  assert.deepEqual(Posts.filterPosts(records, { type: 'found' }).map(p => p.id), [2]);
});

test('类别与地点条件同时生效，地点首尾空格被忽略', () => {
  const records = [post(), post({ id: 2, place: '食堂' }), post({ id: 3, category: '钥匙' })];
  assert.deepEqual(Posts.filterPosts(records, { category: '雨伞', place: ' 图书馆 ' }).map(p => p.id), ['test-1']);
});

test('按发布时间而非丢失时间排序，不修改输入数组', () => {
  const records = [post({ id: 'early', time: '2026-10-07T12:00', createdAt: '2026-10-07T08:00:00+08:00' }), post({ id: 'late', time: '2026-10-01T08:00', createdAt: '2026-10-07T09:00:00+08:00' })];
  const snapshot = JSON.stringify(records);
  assert.deepEqual(Posts.filterPosts(records).map(p => p.id), ['late', 'early']);
  assert.equal(JSON.stringify(records), snapshot);
});

test('旧数据没有发布时间时兼容丢失/拾取时间', () => {
  const records = [post({ id: 1, createdAt: undefined, time: '2026-10-06 08:00' }), post({ id: 2, createdAt: undefined, time: '2026-10-07 08:00' })];
  assert.deepEqual(Posts.filterPosts(records).map(p => p.id), [2, 1]);
});

test('无匹配条件和空列表均返回空数组', () => {
  assert.deepEqual(Posts.filterPosts([post()], { place: '体育馆' }), []);
  assert.deepEqual(Posts.filterPosts([]), []);
});

test('首次打开读取演示数据，每次返回独立副本', () => {
  const first = Posts.loadPosts(storage(null));
  first.posts[0].name = 'modified';
  const second = Posts.loadPosts(storage(null));
  assert.equal(second.source, 'demo');
  assert.equal(second.error, '');
  assert.notEqual(second.posts[0].name, 'modified');
});

test('已有本地发布数据会替换演示数据并保留发布者字段', () => {
  const record = post({ ownerId: 'student-1' });
  const result = Posts.loadPosts(storage(JSON.stringify([record])));
  assert.equal(result.source, 'local');
  assert.deepEqual(result.posts, [record]);
});

test('本地空数组不重新补入演示信息', () => {
  assert.deepEqual(Posts.loadPosts(storage('[]')).posts, []);
});

test('损坏的 JSON 给出读取错误，不覆写原始存储', () => {
  const result = Posts.loadPosts(storage('{broken'));
  assert.equal(result.source, 'demo');
  assert.match(result.error, /无法读取/);
});

test('非数组、缺少必需字段和类型状态不一致均拒绝读取', () => {
  for (const value of [{}, [null], [post({ name: '' })], [post({ type: 'found', status: '已找到' })]]) {
    assert.notEqual(Posts.loadPosts(storage(JSON.stringify(value))).error, '');
  }
});

test('数值与字符串相同的重复 ID 会被拒绝', () => {
  const result = Posts.loadPosts(storage(JSON.stringify([post({ id: 1 }), post({ id: '1' })])));
  assert.notEqual(result.error, '');
});

test('存储访问被禁用时页面仍可读取演示信息', () => {
  const result = Posts.loadPosts({ getItem() { throw new Error('Access denied'); } });
  assert.equal(result.source, 'demo');
  assert.notEqual(result.error, '');
});

test('类别选项去重，未知类别使用通用物品图标', () => {
  assert.deepEqual(Posts.categories([post(), post(), post({ category: '钥匙' })]).sort(), ['钥匙', '雨伞'].sort());
  assert.equal(Posts.iconFor(post({ category: '其他' })), '🔎');
});

test('关键词检索名称及描述，并忽略大小写和首尾空格', () => {
  const records = [post({ name: 'AirPods Pro', desc: '白色充电盒' }), post({ id: 2 })];
  assert.deepEqual(Posts.filterPosts(records, { keyword: '  AIRpods  ' }).map(p => p.id), ['test-1']);
  assert.deepEqual(Posts.filterPosts(records, { keyword: '充电盒' }).map(p => p.id), ['test-1']);
});

test('多个关键词需要全部匹配，可以跨名称和地点字段', () => {
  const records = [post(), post({ id: 2, place: '食堂' }), post({ id: 3, name: '蓝色雨伞' })];
  assert.deepEqual(Posts.filterPosts(records, { keyword: ' 黑色   图书馆 ' }).map(p => p.id), ['test-1']);
});

test('空白关键词显示当前条件下全部有效信息', () => {
  assert.deepEqual(Posts.filterPosts([post()], { keyword: ' \t\n ' }).map(p => p.id), ['test-1']);
});

test('关键词不匹配时返回空数组', () => {
  assert.deepEqual(Posts.filterPosts([post()], { keyword: '不存在的物品' }), []);
});

test('关键词、类型、类别和地点筛选按交集组合', () => {
  const records = [post(), post({ id: 2, type: 'found', status: '招领中' }), post({ id: 3, place: '食堂' })];
  assert.deepEqual(Posts.filterPosts(records, { keyword: '银色', type: 'lost', category: '雨伞', place: '图书馆' }).map(p => p.id), ['test-1']);
});

test('历史信息只有显式选择包含已结束信息时参与搜索', () => {
  const records = [post(), post({ id: 2, status: '已找到' })];
  assert.deepEqual(Posts.filterPosts(records, { keyword: '雨伞' }).map(p => p.id), ['test-1']);
  assert.deepEqual(Posts.filterPosts(records, { keyword: '雨伞', includeFinished: true }).map(p => p.id), ['test-1', 2]);
});

test('联系方式不纳入公开关键词检索', () => {
  assert.deepEqual(Posts.filterPosts([post({ contact: 'only-in-contact-123' })], { keyword: 'only-in-contact-123' }), []);
});

test('HTML 字符作为普通文本参与搜索', () => {
  const record = post({ name: '<script>物品</script>' });
  assert.deepEqual(Posts.filterPosts([record], { keyword: '<script>' }), [record]);
});

test('详情查找兼容数值 ID，并准确定位指定记录', () => {
  const records = [post({ id: 1 }), post({ id: 'post-2' })];
  assert.equal(Posts.findPost(records, '1'), records[0]);
  assert.equal(Posts.findPost(records, 'post-2'), records[1]);
});

test('空 ID、未知 ID 和已删除记录不会错误显示另一条信息', () => {
  for (const id of [null, undefined, '', '  ', 'missing']) assert.equal(Posts.findPost([post()], id), null);
  assert.equal(Posts.findPost([], 'test-1'), null);
});

test('联系方式只去除首尾空格，保持原始内容', () => {
  assert.equal(Posts.contactText(post({ contact: ' 微信：test <account> ' })), '微信：test <account>');
});

test('微信、QQ、手机号的详情标签明确，复制内容仍是原始账号', () => {
  for (const [contactType, label] of [['wechat', '微信号'], ['qq', 'QQ 号码'], ['phone', '手机号']]) {
    const record = post({ contactType, contact: ' 00000000 ' });
    assert.equal(Posts.contactLabel(record), label);
    assert.equal(Posts.contactText(record), '00000000');
  }
});

test('旧记录没有联系方式类型时仍可读，不根据数字猜测微信或 QQ', () => {
  const record = post({ contact: '00000000' });
  assert.deepEqual(Posts.loadPosts(storage(JSON.stringify([record]))).posts, [record]);
  assert.equal(Posts.contactLabel(record), '联系方式（旧记录未分类）');
});

test('存储中的非法联系方式类型报错，避免伪装成合法平台', () => {
  assert.equal(Posts.readStoredPosts(storage(JSON.stringify([post({ contactType: 'email' })]))).ok, false);
});

test('缺少或空白联系方式返回空字符串', () => {
  for (const contact of [undefined, null, '', '  ']) assert.equal(Posts.contactText(post({ contact })), '');
});

test('详情将带时区的发布时间换算为校园北京时间', () => {
  assert.equal(Posts.displayTime('2026-10-07T01:00:00Z'), '2026-10-07 09:00');
  assert.equal(Posts.displayTime('2026-10-07T09:00:00+08:00'), '2026-10-07 09:00');
  assert.equal(Posts.displayTime('2026-10-07T08:10'), '2026-10-07 08:10');
});

test('缺少或损坏的时间不会导致详情渲染报错', () => {
  assert.equal(Posts.displayTime(undefined), '时间未提供');
  assert.equal(Posts.displayTime('not-a-date'), '时间格式异常');
});

test('详情返回路径保留搜索及我的筛选条件，拒绝其他页面或外部地址', () => {
  assert.equal(Detail.backRoute('search?keyword=%E9%9B%A8%E4%BC%9E&finished=1'), 'search?keyword=%E9%9B%A8%E4%BC%9E&finished=1');
  assert.equal(Detail.backRoute('home?type=found'), 'home?type=found');
  assert.equal(Detail.backRoute('my'), 'my');
  assert.equal(Detail.backRoute('my?filter=finished'), 'my?filter=finished');
  for (const from of [null, 'https://example.com', 'javascript:alert(1)', 'detail?id=1']) assert.equal(Detail.backRoute(from), 'home');
});

test('复制成功时写入完整内容，并且等待写入完成', async () => {
  let written = '';
  const result = await Detail.copyText('微信：example', { async writeText(text) { await Promise.resolve(); written = text; } });
  assert.equal(result, true);
  assert.equal(written, '微信：example');
});

test('剪贴板 API 不可用时不提示成功', async () => {
  assert.equal(await Detail.copyText('联系方式', undefined), false);
  assert.equal(await Detail.copyText('联系方式', {}), false);
});

test('剪贴板权限被拒绝时不抛出未处理错误或提示成功', async () => {
  assert.equal(await Detail.copyText('联系方式', { async writeText() { throw new Error('Permission denied'); } }), false);
});
