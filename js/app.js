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
      meta.append(element('span', '', post.place), element('span', '', CampusPosts.displayTime(post.time)));
      main.append(titleRow, element('p', 'desc', post.desc), meta);
      card.append(thumb, main);
      container.append(card);
    });
  }

  let renderVersion = 0;
  async function renderRoute() {
    const version = ++renderVersion;
    const isCurrent = () => version === renderVersion;
    const route = window.location.hash.slice(1) || 'home';
    const separator = route.indexOf('?');
    const page = separator < 0 ? route : route.slice(0, separator);
    const params = new URLSearchParams(separator < 0 ? '' : route.slice(separator + 1));
    if (!['home', 'search', 'detail', 'publish', 'success', 'my'].includes(page)) { navigate('home'); return; }
    document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== 'page-' + page; });
    const navigationPage = page === 'success' ? 'publish' : page === 'detail' ? CampusDetail.backRoute(params.get('from')).split('?')[0] : page;
    document.querySelectorAll('a.nav-link').forEach(function (link) {
      const active = link.dataset.page === navigationPage;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const note = document.getElementById('source-note');
    let data;
    if (CampusApi.enabled) {
      note.textContent = '正在加载校园共享信息…';
      const result = await CampusManage.readPosts();
      if (!isCurrent()) return;
      data = { posts: result.ok ? result.posts : [], source: 'server', error: result.ok ? '' : result.errors.join(' ') };
    } else {
      let storage;
      try { storage = window.localStorage; } catch (error) { storage = null; }
      data = CampusPosts.loadPosts(storage);
    }
    note.classList.toggle('warning', Boolean(data.error));
    note.textContent = data.error || (data.source === 'server' ? '校园共享模式：同学可以浏览这里的寻物与招领信息。' : '本机模式：信息只保存在当前浏览器。');
    if (page === 'home') CampusHome.render(data.posts, params);
    if (page === 'search') CampusSearch.render(data.posts, params);
    if (page === 'detail') CampusDetail.render(data.posts, params);
    if (page === 'publish') PublishModule.render(document.getElementById('publish-form-area'), params);
    if (page === 'success') await PublishModule.renderSuccess(document.getElementById('success-content'), params, isCurrent);
    if (page === 'my') await MyModule.render(document.getElementById('my-list'), params, isCurrent);
    if (!isCurrent()) return;
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

  document.addEventListener('click', function (e) {
    if (e.target.closest('.skip-link')) {
      e.preventDefault();
      document.getElementById('main-content').focus();
      return;
    }
    const btn = e.target.closest('[data-publish-type]');
    if (btn) navigate('publish?type=' + btn.dataset.publishType);
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
    if (event.key === CampusPosts.STORAGE_KEY || event.key === CampusManage.USER_KEY || event.key === null) renderRoute();
  });
  renderRoute();
})();
