(function () {
  'use strict';

  const POSTS_KEY = 'campus-lost-found.posts.v1';
  const USER_KEY = 'campus-lost-found.user.v1';

  function getUserId() {
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  }

  function readPosts() {
    try {
      const raw = localStorage.getItem(POSTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writePosts(posts) {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  }

  function validate(data) {
    const errors = [];
    if (!data.name || !String(data.name).trim()) errors.push('物品名称不能为空');
    if (!data.place || !String(data.place).trim()) errors.push('地点不能为空');
    if (!data.time) errors.push('请选择时间');
    if (!data.contact || !String(data.contact).trim()) errors.push('联系方式不能为空');
    if (!data.type || !['lost', 'found'].includes(data.type)) errors.push('类型错误');
    return errors;
  }

  function savePost(data) {
    const errors = validate(data);
    if (errors.length) return { ok: false, errors };

    const posts = readPosts();
    const post = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      type: data.type,
      name: String(data.name).trim(),
      category: data.category ? String(data.category).trim() : '',
      place: String(data.place).trim(),
      time: data.time,
      desc: data.desc ? String(data.desc).trim() : '',
      contact: String(data.contact).trim(),
      status: data.type === 'lost' ? '寻找中' : '招领中',
      createdAt: new Date().toISOString(),
      ownerId: getUserId()
    };

    posts.push(post);
    writePosts(posts);
    return { ok: true, post: post };
  }

  function getMyPosts() {
    const userId = getUserId();
    return readPosts().filter(function (p) { return p.ownerId === userId; });
  }

  function getPostById(id) {
    return readPosts().find(function (p) { return String(p.id) === String(id); }) || null;
  }

  function isFinished(post) {
    return post.status === '已找到' || post.status === '已归还';
  }

  function updateStatus(id, newStatus) {
    const userId = getUserId();
    const posts = readPosts();
    const post = posts.find(function (p) { return String(p.id) === String(id); });
    if (!post) return { ok: false, errors: ['帖子不存在'] };
    if (post.ownerId !== userId) return { ok: false, errors: ['无权操作'] };
    if (isFinished(post)) return { ok: false, errors: ['已结束，无需重复操作'] };
    post.status = newStatus;
    writePosts(posts);
    return { ok: true };
  }

  function deletePost(id) {
    const userId = getUserId();
    const posts = readPosts();
    const post = posts.find(function (p) { return String(p.id) === String(id); });
    if (!post) return { ok: false, errors: ['帖子不存在'] };
    if (post.ownerId !== userId) return { ok: false, errors: ['无权操作'] };
    writePosts(posts.filter(function (p) { return String(p.id) !== String(id); }));
    return { ok: true };
  }

  window.CampusManage = {
    POSTS_KEY: POSTS_KEY,
    USER_KEY: USER_KEY,
    getUserId: getUserId,
    readPosts: readPosts,
    writePosts: writePosts,
    savePost: savePost,
    getMyPosts: getMyPosts,
    getPostById: getPostById,
    updateStatus: updateStatus,
    deletePost: deletePost
  };
})();