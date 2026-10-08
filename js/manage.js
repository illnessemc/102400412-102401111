(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./posts.js') : root.CampusPosts, isNode ? null : root.CampusApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampusManage = api;
})(globalThis, function (Posts, Api) {
  'use strict';

  const POSTS_KEY = Posts.STORAGE_KEY;
  const USER_KEY = 'campus-lost-found.user.v1';

  function failure(message) {
    return { ok: false, errors: [message] };
  }

  function storageFor(storage) {
    return storage === undefined ? globalThis.localStorage : storage;
  }

  function getUserId(storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('session');
    try {
      const store = storageFor(storage);
      let userId = store.getItem(USER_KEY);
      if (typeof userId !== 'string' || !userId.trim()) {
        userId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        store.setItem(USER_KEY, userId);
      }
      return { ok: true, userId };
    } catch (error) {
      return failure('无法读取或保存发布者身份，请检查浏览器存储权限后重试。');
    }
  }

  function readPosts(storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('posts');
    let store;
    try { store = storageFor(storage); } catch (error) { store = null; }
    const data = Posts.readStoredPosts(store);
    return data.ok ? { ok: true, posts: data.posts } : failure(data.error);
  }

  function writePosts(posts, storage) {
    try {
      storageFor(storage).setItem(POSTS_KEY, JSON.stringify(posts));
      return { ok: true };
    } catch (error) {
      return failure('保存失败，浏览器存储可能已满或被禁用。请检查后重试，原有信息未被改动。');
    }
  }

  function validate(data) {
    const errors = [];
    if (!data || !['lost', 'found'].includes(data.type)) errors.push('请选择寻物或招领类型');
    if (!data || typeof data.contactType !== 'string' || !Object.hasOwn(Posts.CONTACT_TYPES, data.contactType)) errors.push('请选择微信、QQ 或手机号作为联系方式类型');
    const fields = [['name', '物品名称', 50], ['place', '地点', 50], ['contact', '联系方式', 50]];
    fields.forEach(function ([key, label, limit]) {
      const value = data && data[key];
      if (typeof value !== 'string' || !value.trim()) errors.push(label + '不能为空');
      else if (value.trim().length > limit) errors.push(label + '不能超过' + limit + '个字符');
    });
    [['category', '物品类别', 20], ['desc', '描述', 200]].forEach(function ([key, label, limit]) {
      const value = data && data[key];
      if (value != null && (typeof value !== 'string' || value.trim().length > limit)) errors.push(label + '格式不正确或超过' + limit + '个字符');
    });
    const time = data && data.time;
    const match = typeof time === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(time);
    const date = match && new Date(time);
    if (!match || !Number.isFinite(date.getTime()) ||
      [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()].some((value, index) => value !== Number(match[index + 1]))) {
      errors.push('请选择有效的丢失或拾取时间');
    }
    return errors;
  }

  function savePost(data, storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('posts', { method: 'POST', data });
    const errors = validate(data);
    if (errors.length) return { ok: false, errors };
    const records = readPosts(storage);
    if (!records.ok) return records;
    const identity = getUserId(storage);
    if (!identity.ok) return identity;
    let id;
    do {
      id = 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    } while (Posts.findPost(records.posts, id));
    const post = {
      id, type: data.type, name: data.name.trim(), category: (data.category || '').trim(),
      place: data.place.trim(), time: data.time, desc: (data.desc || '').trim(), contactType: data.contactType, contact: data.contact.trim(),
      status: data.type === 'lost' ? '寻找中' : '招领中', createdAt: new Date().toISOString(), ownerId: identity.userId
    };
    const written = writePosts([...records.posts, post], storage);
    return written.ok ? { ok: true, post } : written;
  }

  function getMyPosts(storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('my-posts');
    const records = readPosts(storage);
    if (!records.ok) return records;
    const identity = getUserId(storage);
    if (!identity.ok) return identity;
    const posts = Posts.filterPosts(records.posts, { includeFinished: true }).filter(post => post.ownerId === identity.userId);
    return { ok: true, posts };
  }

  function getPostById(id, storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('posts/' + encodeURIComponent(id));
    const records = readPosts(storage);
    return records.ok ? { ok: true, post: Posts.findPost(records.posts, id) } : records;
  }

  function updateStatus(id, newStatus, storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('posts/' + encodeURIComponent(id), { method: 'PATCH', data: { status: newStatus } });
    const records = readPosts(storage);
    if (!records.ok) return records;
    const identity = getUserId(storage);
    if (!identity.ok) return identity;
    const post = Posts.findPost(records.posts, id);
    if (!post) return failure('这条信息不存在或已被删除');
    if (post.ownerId !== identity.userId) return failure('只能操作本人发布的信息');
    if (Posts.isFinished(post)) return failure('信息已结束，无需重复操作');
    if (newStatus !== (post.type === 'lost' ? '已找到' : '已归还')) return failure('不允许修改为该状态');
    post.status = newStatus;
    return writePosts(records.posts, storage);
  }

  function deletePost(id, storage) {
    if (storage === undefined && Api && Api.enabled) return Api.request('posts/' + encodeURIComponent(id), { method: 'DELETE' });
    const records = readPosts(storage);
    if (!records.ok) return records;
    const identity = getUserId(storage);
    if (!identity.ok) return identity;
    const post = Posts.findPost(records.posts, id);
    if (!post) return failure('这条信息不存在或已被删除');
    if (post.ownerId !== identity.userId) return failure('只能删除本人发布的信息');
    return writePosts(records.posts.filter(record => String(record.id) !== String(id)), storage);
  }

  return { POSTS_KEY, USER_KEY, getUserId, readPosts, savePost, getMyPosts, getPostById, updateStatus, deletePost };
});
