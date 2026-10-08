const test = require('node:test');
const assert = require('node:assert/strict');
const Manage = require('../js/manage.js');
const Posts = require('../js/posts.js');

class MockStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

function input(fields = {}) {
  return { type: 'lost', name: '黑色雨伞', category: '雨伞', place: '图书馆', time: '2026-10-08T09:00', desc: '银色伞柄', contactType: 'wechat', contact: '微信：test', ...fields };
}

function seed(fields = {}) {
  const storage = new MockStorage();
  const saved = Manage.savePost(input(fields), storage);
  assert.equal(saved.ok, true);
  return { storage, post: saved.post };
}

for (const [contactType, contact] of [['wechat', 'test_account'], ['qq', '00000000'], ['phone', '00000000000']]) {
  test(contactType + '的类型与原始号码一起保存、读取，不混成同一个字段', () => {
    const { storage, post } = seed({ contactType, contact: ' ' + contact + ' ' });
    assert.equal(post.contactType, contactType);
    assert.equal(post.contact, contact);
    assert.equal(Manage.getPostById(post.id, storage).post.contactType, contactType);
  });
}

test('缺失或非法联系方式类型拒绝发布，且不写入身份与信息', () => {
  for (const contactType of [undefined, null, '', 'email', '__proto__', ['wechat'], 1, true]) {
    const storage = new MockStorage();
    assert.equal(Manage.savePost(input({ contactType }), storage).ok, false);
    assert.equal(storage.data.size, 0);
  }
});

test('本地身份创建一次，刷新读取保持相同', () => {
  const storage = new MockStorage();
  const first = Manage.getUserId(storage);
  assert.equal(first.ok, true);
  assert.deepEqual(Manage.getUserId(storage), first);
});

test('寻物发布持久化，保留所有者并去除首尾空格', () => {
  const { storage, post } = seed({ name: ' 黑色雨伞 ', place: ' 图书馆 ', contact: ' 微信：test ' });
  assert.equal(post.name, '黑色雨伞');
  assert.equal(post.place, '图书馆');
  assert.equal(post.contact, '微信：test');
  assert.equal(post.status, '寻找中');
  assert.equal(post.ownerId, Manage.getUserId(storage).userId);
  assert.deepEqual(Posts.loadPosts(storage).posts, [post]);
});

test('招领发布使用招领中状态，连续发布 ID 不重复', () => {
  const { storage, post } = seed({ type: 'found' });
  const next = Manage.savePost(input({ type: 'found' }), storage);
  assert.equal(post.status, '招领中');
  assert.notEqual(next.post.id, post.id);
  assert.equal(Manage.readPosts(storage).posts.length, 2);
});

test('缺少、空白、超长必填项、非法类型和非法时间拒绝写入', () => {
  const cases = [null, {}, input({ name: ' ' }), input({ place: '' }), input({ contact: '' }), input({ name: 'a'.repeat(51) }), input({ category: 'a'.repeat(21) }), input({ desc: 1 }), input({ type: 'other' }), input({ time: '1' }), input({ time: '2026-02-30T09:00' })];
  for (const data of cases) {
    const storage = new MockStorage();
    assert.equal(Manage.savePost(data, storage).ok, false);
    assert.equal(storage.data.size, 0);
  }
});

test('可选类别与描述为空时仍可发布且符合读取约定', () => {
  const { storage, post } = seed({ category: undefined, desc: undefined });
  assert.equal(post.category, '');
  assert.equal(post.desc, '');
  assert.equal(Posts.loadPosts(storage).error, '');
});

test('本人列表排除其他人和无所有者的旧记录', () => {
  const { storage, post } = seed();
  storage.setItem(Manage.POSTS_KEY, JSON.stringify([post, { ...post, id: 'other', ownerId: 'other-user' }, { ...post, id: 'legacy', ownerId: undefined }]));
  assert.deepEqual(Manage.getMyPosts(storage).posts, [post]);
});

test('查询支持数字 ID，不存在和空 ID 返回 null', () => {
  const { storage, post } = seed();
  storage.setItem(Manage.POSTS_KEY, JSON.stringify([{ ...post, id: 123 }]));
  assert.equal(Manage.getPostById('123', storage).post.id, 123);
  for (const id of ['', null, 'missing']) assert.equal(Manage.getPostById(id, storage).post, null);
});

for (const [type, status] of [['lost', '已找到'], ['found', '已归还']]) {
  test(type + '只允许结束为' + status + '，结束后不能重复标记', () => {
    const { storage, post } = seed({ type });
    assert.equal(Manage.updateStatus(post.id, status, storage).ok, true);
    assert.equal(Manage.getPostById(post.id, storage).post.status, status);
    const raw = storage.getItem(Manage.POSTS_KEY);
    assert.equal(Manage.updateStatus(post.id, status, storage).ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
  });
}

test('未知、原状态、跨类型状态均拒绝且不改动原始值', () => {
  const { storage, post } = seed();
  const raw = storage.getItem(Manage.POSTS_KEY);
  for (const status of ['已归还', '寻找中', 'other', undefined]) {
    assert.equal(Manage.updateStatus(post.id, status, storage).ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
  }
});

test('其他用户不能更新或删除信息', () => {
  const { storage, post } = seed();
  storage.setItem(Manage.USER_KEY, 'other-user');
  const raw = storage.getItem(Manage.POSTS_KEY);
  assert.equal(Manage.updateStatus(post.id, '已找到', storage).ok, false);
  assert.equal(Manage.deletePost(post.id, storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
});

test('删除仅移除指定记录，删除最后一条不恢复演示信息', () => {
  const { storage, post } = seed();
  const next = Manage.savePost(input({ name: '校园卡' }), storage).post;
  assert.equal(Manage.deletePost(post.id, storage).ok, true);
  assert.deepEqual(Manage.readPosts(storage).posts, [next]);
  assert.equal(Manage.deletePost(next.id, storage).ok, true);
  assert.deepEqual(Posts.loadPosts(storage).posts, []);
});

test('不存在的记录无法更新或删除', () => {
  const { storage } = seed();
  assert.equal(Manage.updateStatus('missing', '已找到', storage).ok, false);
  assert.equal(Manage.deletePost('missing', storage).ok, false);
});

for (const [name, raw] of [['损坏 JSON', '{broken'], ['非数组', '{}'], ['非法数组成员', '[null]'], ['空字符串', '']]) {
  test(name + '阻止发布、读取本人记录、更新和删除，原文保留', () => {
    const storage = new MockStorage();
    storage.setItem(Manage.POSTS_KEY, raw);
    for (const run of [() => Manage.savePost(input(), storage), () => Manage.getMyPosts(storage), () => Manage.getPostById('id', storage), () => Manage.updateStatus('id', '已找到', storage), () => Manage.deletePost('id', storage)]) {
      assert.equal(run().ok, false);
      assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
    }
    assert.equal(storage.getItem(Manage.USER_KEY), null);
  });
}

test('类型状态错配和重复 ID 阻止写入', () => {
  const { storage, post } = seed();
  for (const records of [[{ ...post, type: 'found' }], [post, { ...post }]]) {
    const raw = JSON.stringify(records);
    storage.setItem(Manage.POSTS_KEY, raw);
    assert.equal(Manage.savePost(input(), storage).ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
  }
});

test('读取权限被禁用或存储不可用返回错误而不抛异常', () => {
  for (const storage of [null, { getItem() { throw new Error('SecurityError'); } }]) {
    assert.equal(Manage.getUserId(storage).ok, false);
    assert.equal(Manage.readPosts(storage).ok, false);
    assert.equal(Manage.savePost(input(), storage).ok, false);
    assert.equal(Manage.getMyPosts(storage).ok, false);
  }
});

test('身份首次写入失败不会写入帖子', () => {
  const storage = new MockStorage();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(Manage.savePost(input(), storage).ok, false);
  assert.equal(storage.getItem(Manage.POSTS_KEY), null);
});

test('存储写满时发布、更新、删除返回失败，旧记录保持不变', () => {
  const { storage, post } = seed();
  const raw = storage.getItem(Manage.POSTS_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  for (const run of [() => Manage.savePost(input(), storage), () => Manage.updateStatus(post.id, '已找到', storage), () => Manage.deletePost(post.id, storage)]) {
    assert.equal(run().ok, false);
    assert.equal(storage.getItem(Manage.POSTS_KEY), raw);
  }
});
