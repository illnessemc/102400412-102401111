(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampusPosts = api;
})(globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'campus-lost-found.posts.v1';
  const STATUS = { lost: ['寻找中', '已找到'], found: ['招领中', '已归还'] };
  const DEMO_POSTS = [
    { id: 'demo-1', type: 'found', name: '校园卡（一卡通）', category: '校园卡/证件', place: '三食堂二楼', time: '2026-10-07T12:30', createdAt: '2026-10-07T13:00:00+08:00', status: '招领中', desc: '在靠窗位置捡到一张校园卡，卡面完好，请失主说明卡面信息进行确认。', contact: 'QQ：123456789（示例）' },
    { id: 'demo-2', type: 'lost', name: '黑色长柄雨伞', category: '雨伞', place: '图书馆一楼大厅', time: '2026-10-07T08:10', createdAt: '2026-10-07T12:50:00+08:00', status: '寻找中', desc: '黑色长柄雨伞，伞柄有银色金属环，可能遗落在门口伞架。', contact: '微信：demo-umbrella（示例）' },
    { id: 'demo-3', type: 'found', name: 'AirPods Pro 充电盒', category: '电子产品', place: '东区体育馆', time: '2026-10-06T19:20', createdAt: '2026-10-07T12:40:00+08:00', status: '招领中', desc: '白色充电盒，盒身有一道浅划痕，请通过外观细节确认。', contact: '微信：demo-airpods（示例）' },
    { id: 'demo-4', type: 'lost', name: '小熊挂件钥匙串', category: '钥匙', place: '1号教学楼 305', time: '2026-10-06T16:40', createdAt: '2026-10-07T11:00:00+08:00', status: '寻找中', desc: '三把钥匙，带黄色小熊挂件，其中包含宿舍钥匙。', contact: 'QQ：987654321（示例）' },
    { id: 'demo-5', type: 'found', name: '蓝色保温杯', category: '水杯', place: '北苑宿舍楼下', time: '2026-10-06T09:15', createdAt: '2026-10-07T10:00:00+08:00', status: '已归还', desc: '杯身有白色贴纸，物品已归还，信息保留供查看历史状态。', contact: '微信：demo-cup（示例）' },
    { id: 'demo-6', type: 'lost', name: '高等数学教材', category: '书籍文具', place: '图书馆三楼自习区', time: '2026-10-06T15:00', createdAt: '2026-10-07T09:30:00+08:00', status: '寻找中', desc: '书皮上贴有蓝色姓名贴，书内有铅笔笔记。', contact: '微信：demo-book（示例）' },
    { id: 'demo-7', type: 'found', name: '灰色针织帽', category: '衣物配饰', place: '东区操场看台', time: '2026-10-05T18:20', createdAt: '2026-10-06T19:00:00+08:00', status: '招领中', desc: '帽沿内侧有小标签，目前由拾到的同学保管。', contact: 'QQ：24681012（示例）' },
    { id: 'demo-8', type: 'lost', name: '白色无线耳机', category: '电子产品', place: '三食堂门口', time: '2026-10-05T12:10', createdAt: '2026-10-06T13:00:00+08:00', status: '已找到', desc: '已经找回，谢谢提供线索的同学。', contact: '微信：demo-headphones（示例）' }
  ];

  function isFinished(post) {
    return post.status === '已找到' || post.status === '已归还';
  }

  function timestamp(value) {
    if (typeof value !== 'string' || !value.trim()) return 0;
    const parsed = Date.parse(value.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function filterPosts(posts, options = {}) {
    const place = String(options.place || '').trim().toLowerCase();
    const terms = String(options.keyword || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter(function (post) {
      const searchable = [post.name, post.category, post.place, post.desc].join(' ').toLowerCase();
      return (options.includeFinished || !isFinished(post)) &&
        (!options.type || options.type === 'all' || post.type === options.type) &&
        (!options.category || post.category === options.category) &&
        (!place || post.place.toLowerCase().includes(place)) &&
        terms.every(term => searchable.includes(term));
    }).sort(function (a, b) {
      return timestamp(b.createdAt || b.time) - timestamp(a.createdAt || b.time);
    });
  }

  function validPosts(posts) {
    if (!Array.isArray(posts)) return false;
    const ids = new Set();
    return posts.every(function (post) {
      if (!post || typeof post !== 'object') return false;
      if (!((typeof post.id === 'string' && post.id.trim()) || (typeof post.id === 'number' && Number.isFinite(post.id)))) return false;
      if (ids.has(String(post.id))) return false;
      ids.add(String(post.id));
      return Object.hasOwn(STATUS, post.type) && STATUS[post.type].includes(post.status) &&
        ['name', 'category', 'place', 'time', 'desc'].every(key => typeof post[key] === 'string') &&
        Boolean(post.name.trim()) && (post.contact == null || typeof post.contact === 'string') &&
        (post.createdAt == null || typeof post.createdAt === 'string');
    });
  }

  // 改动：有真实数据时合并演示数据，演示数据永远作为"预置数据库"存在
  function loadPosts(storage) {
    const demo = () => DEMO_POSTS.map(post => ({ ...post, _demo: true }));
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { posts: demo(), source: 'demo', error: '' };
      const posts = JSON.parse(raw);
      if (!validPosts(posts)) throw new Error('Invalid post data');
      // 合并：演示数据永远在前，真实数据在后
      const merged = [...DEMO_POSTS.map(post => ({ ...post, _demo: true })), ...posts];
      return { posts: merged, source: 'local', error: '' };
    } catch (error) {
      return { posts: demo(), source: 'demo', error: '本地数据暂时无法读取，当前显示演示信息。原有数据未被改动。' };
    }
  }

  function categories(posts) {
    return [...new Set(posts.map(post => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  function iconFor(post) {
    const icons = { '校园卡/证件': '🪪', '雨伞': '☂️', '电子产品': '🎧', '钥匙': '🔑', '水杯': '🥤', '书籍文具': '📚', '衣物配饰': '🧢' };
    return icons[post.category] || (post.type === 'lost' ? '🔎' : '📦');
  }

  function displayTime(value) {
    if (typeof value !== 'string' || !value.trim()) return '时间未提供';
    if (!Number.isFinite(Date.parse(value.replace(' ', 'T')))) return '时间格式异常';
    if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(value)) return value.replace('T', ' ').slice(0, 16);
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(value));
    const field = type => parts.find(part => part.type === type).value;
    return field('year') + '-' + field('month') + '-' + field('day') + ' ' + field('hour') + ':' + field('minute');
  }

  function findPost(posts, id) {
    if (id == null || String(id).trim() === '') return null;
    return posts.find(post => String(post.id) === String(id)) || null;
  }

  function contactText(post) {
    return typeof post.contact === 'string' ? post.contact.trim() : '';
  }

  return { STORAGE_KEY, DEMO_POSTS, isFinished, filterPosts, loadPosts, categories, iconFor, displayTime, findPost, contactText };
});