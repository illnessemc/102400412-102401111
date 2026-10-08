(function () {
  'use strict';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function navigate(route) {
    if (window.location.hash === '#' + route) renderRoute();
    else window.location.hash = route;
  }

  function setCategories(select, posts, selected) {
    const values = CampusPosts.categories(posts);
    if (selected && !values.includes(selected)) values.push(selected);
    select.replaceChildren(new Option('全部类别', ''));
    values.forEach(value => select.add(new Option(value, value)));
    select.value = selected;
  }

  function renderList(container, posts, from) {
    container.replaceChildren();
    if (!posts.length) {
      const empty = element('div', 'empty');
      empty.append(element('h2', '', '暂无匹配的信息'), element('p', '', '试试其他类别、地点或关键词。'));
      container.append(empty);
      return;
    }
    posts.forEach(function (post) {
      const card = element('a', 'card');
      const params = new URLSearchParams({ id: String(post.id), from: from });
      card.href = '#detail?' + params.toString();
      const thumb = element('span', 'thumb', CampusPosts.iconFor(post));
      thumb.setAttribute('aria-hidden', 'true');
      const main = element('div', 'card-main');
      const titleRow = element('div', 'card-title-row');
      const statusClass = CampusPosts.isFinished(post) ? 'done' : post.type;
      titleRow.append(element('span', 'card-title', post.name), element('span', 'badge ' + statusClass, post.status));
      const meta = element('div', 'meta');
      meta.append(element('span', '', '📍 ' + post.place), element('span', '', '🕒 ' + CampusPosts.displayTime(post.time)), element('span', '', post.type === 'lost' ? '寻物' : '招领'));
      main.append(titleRow, element('p', 'desc', post.desc), meta);
      card.append(thumb, main);
      container.append(card);
    });
  }

  function renderRoute() {
    const route = window.location.hash.slice(1) || 'home';
    const separator = route.indexOf('?');
    const page = separator < 0 ? route : route.slice(0, separator);
    const params = new URLSearchParams(separator < 0 ? '' : route.slice(separator + 1));
    // ↓ 白名单加入 publish / success / my
    if (!['home', 'search', 'detail', 'publish', 'success', 'my'].includes(page)) { navigate('home'); return; }
    let storage;
    try { storage = window.localStorage; } catch (error) { storage = null; }
    const data = CampusPosts.loadPosts(storage);
    const note = document.getElementById('source-note');
    note.classList.toggle('warning', Boolean(data.error));
    note.textContent = data.error || (data.source === 'demo' ? '当前显示演示信息，请勿联系示例账号。' : '当前显示本浏览器保存的信息。');
    document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== 'page-' + page; });
    document.querySelectorAll('a.nav-link').forEach(function (link) {
      const active = link.dataset.page === page;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (page === 'home') CampusHome.render(data.posts, params);
    if (page === 'search') CampusSearch.render(data.posts, params);
    if (page === 'detail') CampusDetail.render(data.posts, params, data.source === 'demo');
    // ↓ 新增三个页面的渲染调用
    if (page === 'publish') { const area = document.getElementById('publish-form-area'); if (area && window.PublishModule) window.PublishModule.render(area); }
    if (page === 'success') { const content = document.getElementById('success-content'); if (content && window.PublishModule) window.PublishModule.renderSuccess(content, params); }
    if (page === 'my') { const list = document.getElementById('my-list'); if (list && window.MyModule) window.MyModule.render(list); }
    const titles = { home: '首页', search: '搜索物品', detail: '信息详情', publish: '发布信息', success: '发布成功', my: '我的发布' };
    document.title = (titles[page] || '') + ' · 校园失物招领';
  }

  let toastTimer;
  function toast(message) {
    const node = document.getElementById('toast');
    clearTimeout(toastTimer);
    node.textContent = message;
    node.hidden = false;
    toastTimer = setTimeout(function () { node.hidden = true; }, 4000);
  }

  // 首页快捷按钮绑定
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-publish-type]');
    if (btn) { location.hash = '#publish'; }
  });

  window.CampusUI = { element, navigate, setCategories, renderList, toast };
  CampusHome.init();
  CampusSearch.init();
  window.addEventListener('hashchange', function () {
    renderRoute();
    window.scrollTo(0, 0);
  });
  window.addEventListener('campus:posts-changed', renderRoute);
  window.addEventListener('storage', function (event) {
    if (event.key === CampusPosts.STORAGE_KEY || event.key === null) renderRoute();
  });
  renderRoute();
})();