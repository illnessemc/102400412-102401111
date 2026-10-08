(function () {
  'use strict';

  function finishStatus(post) {
    return post.type === 'lost' ? '已找到' : '已归还';
  }

  function renderCard(post, from) {
    const el = CampusUI.element;
    const done = CampusPosts.isFinished(post);
    const card = el('div', 'my-card' + (done ? ' finished' : ''));
    const heading = el('div', 'card-title-row');
    heading.append(el('strong', 'card-title', post.name), el('span', 'badge ' + (done ? 'done' : post.type), post.status));
    const meta = el('p', 'meta', post.place + ' · ' + CampusPosts.displayTime(post.time));
    const actions = el('div', 'form-actions');
    const detail = el('a', 'back-link', '查看详情');
    detail.href = '#detail?' + new URLSearchParams({ id: String(post.id), from }).toString();
    actions.append(detail);
    if (!done) {
      const finish = el('button', 'filter-button', '标记为' + finishStatus(post));
      finish.type = 'button';
      finish.dataset.action = 'finish';
      finish.dataset.id = post.id;
      actions.append(finish);
    }
    const remove = el('button', 'text-button danger-button', '删除');
    remove.type = 'button';
    remove.dataset.action = 'delete';
    remove.dataset.id = post.id;
    actions.append(remove);
    card.append(heading, meta, actions);
    return card;
  }

  function bindActions(container) {
    if (container.dataset.initialized) return;
    container.dataset.initialized = '1';
    container.addEventListener('change', function (event) {
      if (event.target.id !== 'my-filter') return;
      const filter = event.target.value;
      CampusUI.navigate(filter === 'all' ? 'my' : 'my?filter=' + filter);
    });
    container.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled) return;
      const result = CampusManage.getPostById(button.dataset.id);
      if (!result.ok) { CampusUI.toast(result.errors.join(' ')); return; }
      if (!result.post) { CampusUI.toast('这条信息不存在或已被删除'); return; }
      const deleting = button.dataset.action === 'delete';
      if (!confirm(deleting ? '确定删除这条发布吗？' : '确定标记为' + finishStatus(result.post) + '吗？')) return;
      button.disabled = true;
      const saved = deleting ? CampusManage.deletePost(result.post.id) : CampusManage.updateStatus(result.post.id, finishStatus(result.post));
      if (!saved.ok) {
        button.disabled = false;
        CampusUI.toast(saved.errors.join(' '));
        return;
      }
      window.dispatchEvent(new Event('campus:posts-changed'));
      CampusUI.toast(deleting ? '发布记录已删除' : '状态已更新为' + finishStatus(result.post));
    });
  }

  function render(container, params) {
    bindActions(container);
    const el = CampusUI.element;
    container.replaceChildren();
    const result = CampusManage.getMyPosts();
    if (!result.ok) {
      const errorNote = el('p', 'form-error', result.errors.join(' '));
      errorNote.setAttribute('role', 'alert');
      container.append(errorNote);
      return;
    }
    const posts = result.posts;
    const ongoing = posts.filter(post => !CampusPosts.isFinished(post)).length;
    const stats = el('div', 'my-stats');
    stats.id = 'my-stats';
    [['全部', posts.length], ['进行中', ongoing], ['已结束', posts.length - ongoing]].forEach(function ([label, count]) {
      const item = el('div', 'stat-card');
      item.append(el('strong', '', String(count)), el('span', '', label));
      stats.append(item);
    });
    const filter = ['ongoing', 'finished'].includes(params.get('filter')) ? params.get('filter') : 'all';
    const filterLabel = el('label', 'my-filter-label', '筛选发布记录');
    filterLabel.htmlFor = 'my-filter';
    const select = el('select', '');
    select.id = 'my-filter';
    [['all', '全部'], ['ongoing', '进行中'], ['finished', '已结束']].forEach(([value, label]) => select.add(new Option(label, value)));
    select.value = filter;
    filterLabel.append(select);
    const cards = el('div', 'my-cards');
    cards.id = 'my-cards';
    const visible = posts.filter(post => filter === 'all' || (filter === 'finished' ? CampusPosts.isFinished(post) : !CampusPosts.isFinished(post)));
    const from = filter === 'all' ? 'my' : 'my?filter=' + filter;
    if (!visible.length) {
      const empty = el('div', 'empty');
      empty.append(el('h2', '', posts.length ? '当前筛选下暂无记录' : '你还没有发布信息'));
      if (posts.length) empty.append(el('p', '', '切换筛选条件，查看其他发布记录。'));
      else {
        const publish = el('a', 'back-link', '发布第一条信息');
        publish.href = '#publish';
        empty.append(publish);
      }
      cards.append(empty);
    } else visible.forEach(post => cards.append(renderCard(post, from)));
    container.append(stats, filterLabel, cards);
  }

  window.MyModule = { render };
})();