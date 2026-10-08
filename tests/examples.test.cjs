// 正文示例：直接测试正式函数。每条用例都有独立存储，不依赖页面或服务。
const test = require('node:test');
const assert = require('node:assert/strict');
const Manage = require('../js/manage.js');
const Posts = require('../js/posts.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function input(fields = {}) {
  return {
    type: 'lost', name: '黑色雨伞', category: '雨伞', place: '图书馆',
    time: '2026-10-08T09:00', desc: '银色伞柄',
    contactType: 'wechat', contact: 'TEST_ONLY_ACCOUNT', ...fields
  };
}

test('SC01 正常寻物发布：保存字段、所有者与初始状态', () => {
  const storage = memoryStorage(); // Arrange：准备数据和独立环境
  const saved = Manage.savePost(input({ name: ' 黑色雨伞 ' }), storage); // Act
  assert.equal(saved.ok, true); // Assert：检查可观察结果
  assert.equal(saved.post.name, '黑色雨伞');
  assert.equal(saved.post.status, '寻找中');
  assert.equal(saved.post.ownerId, Manage.getUserId(storage).userId);
  assert.deepEqual(Manage.readPosts(storage).posts, [saved.post]);
});

test('SC02 正常招领发布：使用招领中，连续记录 ID 不重复', () => {
  const storage = memoryStorage();
  const first = Manage.savePost(input({ type: 'found' }), storage);
  const second = Manage.savePost(input({ type: 'found' }), storage);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.post.status, '招领中');
  assert.notEqual(first.post.id, second.post.id);
  assert.equal(Manage.readPosts(storage).posts.length, 2);
});

test('SC03 必填项空白：拒绝发布且不写入数据', () => {
  for (const field of ['name', 'place', 'contact']) {
    const storage = memoryStorage();
    assert.equal(Manage.savePost(input({ [field]: '  ' }), storage).ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), null);
    assert.equal(storage.getItem(Manage.USER_KEY), null);
  }
});

test('SC04 联系方式类型缺失或非法：拒绝含糊的平台', () => {
  for (const contactType of [undefined, '', 'email']) {
    const storage = memoryStorage();
    assert.equal(Manage.savePost(input({ contactType }), storage).ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), null);
  }
});

test('SC05 名称长度边界：50 字成功，51 字失败且旧记录不变', () => {
  const storage = memoryStorage();
  assert.equal(Manage.savePost(input({ name: '伞'.repeat(50) }), storage).ok, true);
  const before = storage.getItem(Manage.POSTS_KEY);
  assert.equal(Manage.savePost(input({ name: '伞'.repeat(51) }), storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), before);
});

test('SC06 多关键词与筛选：名称、地点、类别按交集匹配', () => {
  const storage = memoryStorage();
  const target = Manage.savePost(input(), storage).post;
  Manage.savePost(input({ name: '蓝色雨伞' }), storage);
  Manage.savePost(input({ place: '食堂' }), storage);
  const result = Posts.filterPosts(Manage.readPosts(storage).posts, {
    keyword: '黑色 图书馆', type: 'lost', category: '雨伞', place: '图书馆'
  });
  assert.deepEqual(result.map(post => post.id), [target.id]);
  assert.deepEqual(Posts.filterPosts(result, { keyword: '不存在的物品' }), []);
});

test('SC07 指定详情与三类联系标签：定位正确，复制值不含额外前缀', () => {
  const storage = memoryStorage();
  for (const [contactType, label] of [['wechat', '微信号'], ['qq', 'QQ 号码'], ['phone', '手机号']]) {
    const saved = Manage.savePost(input({ contactType, contact: ' 00000000 ' }), storage);
    const detail = Manage.getPostById(saved.post.id, storage).post;
    assert.equal(detail.id, saved.post.id);
    assert.equal(Posts.contactLabel(detail), label);
    assert.equal(Posts.contactText(detail), '00000000');
  }
  assert.equal(Manage.getPostById('missing', storage).post, null);
});

test('SC08 本人找到寻物：结束后默认隐藏，历史查询仍可见', () => {
  const storage = memoryStorage();
  const post = Manage.savePost(input(), storage).post;
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, true);
  const records = Manage.readPosts(storage).posts;
  assert.deepEqual(Posts.filterPosts(records), []);
  assert.equal(Posts.filterPosts(records, { includeFinished: true })[0].status, '已找到');
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, false);
});

test('SC09 本人归还招领：拒绝已找到，允许已归还', () => {
  const storage = memoryStorage();
  const post = Manage.savePost(input({ type: 'found' }), storage).post;
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, false);
  assert.equal(Manage.getPostById(post.id, storage).post.status, '招领中');
  assert.equal(Manage.updateStatus(post.id, '已归还', storage).ok, true);
  assert.equal(Manage.getPostById(post.id, storage).post.status, '已归还');
});

test('SC10 非发布者操作：看不到本人列表，更新和删除被拒绝', () => {
  const storage = memoryStorage();
  const post = Manage.savePost(input(), storage).post;
  storage.setItem(Manage.USER_KEY, 'another-user');
  const before = storage.getItem(Manage.POSTS_KEY);
  assert.deepEqual(Manage.getMyPosts(storage).posts, []);
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, false);
  assert.equal(Manage.deletePost(post.id, storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), before);
});

test('SC11 损坏 JSON：阻止写入，保留原文便于恢复', () => {
  const storage = memoryStorage();
  storage.setItem(Manage.POSTS_KEY, '{broken');
  assert.equal(Manage.savePost(input(), storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), '{broken');
});

test('SC12 存储写满：发布与状态更新失败，旧记录保持', () => {
  const storage = memoryStorage();
  const post = Manage.savePost(input(), storage).post;
  const before = storage.getItem(Manage.POSTS_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(Manage.savePost(input(), storage).ok, false);
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), before);
});
