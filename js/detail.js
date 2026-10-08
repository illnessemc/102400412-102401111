(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampusDetail = api;
})(globalThis, function () {
  'use strict';

  function backRoute(from) {
    if (typeof from !== 'string') return 'home';
    const page = from.split('?')[0];
    return ['home', 'search', 'my'].includes(page) ? from : 'home';
  }

  async function copyText(text, clipboard) {
    if (!text || !clipboard || typeof clipboard.writeText !== 'function') return false;
    try {
      await clipboard.writeText(text);
      return true;
    } catch (error) {
      return false;
    }
  }

  function render(posts, params, isDemo) {
    const el = CampusUI.element;
    const container = document.getElementById('detail-content');
    container.replaceChildren();
    const from = backRoute(params.get('from'));
    document.getElementById('detail-back').href = '#' + from;
    const post = CampusPosts.findPost(posts, params.get('id'));
    if (!post) {
      const empty = el('div', 'empty');
      const back = el('a', 'back-link', '返回列表');
      back.href = '#' + from;
      empty.append(el('h2', '', '这条信息不存在或已被删除'), el('p', '', '返回列表，查看其他寻物或招领信息。'), back);
      container.append(empty);
      return;
    }

    const layout = el('div', 'detail-layout');
    const cover = el('div', 'detail-cover', CampusPosts.iconFor(post));
    cover.setAttribute('aria-hidden', 'true');
    const info = el('div', 'detail-card');
    info.append(el('span', 'badge ' + post.type, post.type === 'lost' ? '寻物信息' : '招领信息'));
    info.append(el('h2', 'detail-title', post.name));
    info.append(el('span', 'badge ' + (CampusPosts.isFinished(post) ? 'done' : post.type), post.status));
    const grid = el('dl', 'detail-grid');
    const values = [
      [post.type === 'lost' ? '丢失时间' : '拾取时间', CampusPosts.displayTime(post.time)],
      [post.type === 'lost' ? '丢失地点' : '拾取地点', post.place || '地点未提供'],
      ['物品类别', post.category || '类别未提供']
    ];
    if (post.createdAt) values.push(['发布时间', CampusPosts.displayTime(post.createdAt)]);
    values.forEach(function ([label, value]) { grid.append(el('dt', '', label), el('dd', '', value)); });
    info.append(grid);
    layout.append(cover, info);
    container.append(layout);

    if (CampusPosts.isFinished(post)) {
      container.append(el('p', 'notice finished', '该信息已标记为“' + post.status + '”。联系前请确认仍有需要，避免重复询问。'));
    }
    const description = el('div', 'detail-card');
    description.append(el('h2', '', '物品描述'), el('p', 'detail-text', post.desc || '发布者暂未提供详细描述。'));
    container.append(description);

    const contactCard = el('div', 'detail-card');
    contactCard.append(el('h2', '', '联系方式'));
    const contact = CampusPosts.contactText(post);
    if (!contact) {
      contactCard.append(el('p', 'contact-note', '发布者暂未提供联系方式。'));
    } else {
      contactCard.append(el('p', 'contact-note', isDemo ? '以下为演示联系方式，仅用于操作体验，请勿联系示例账号。' : '先核对时间、地点和物品特征，再使用发布者提供的联系方式联系。'));
      const reveal = el('button', 'filter-button', '查看联系方式');
      reveal.type = 'button';
      reveal.setAttribute('aria-expanded', 'false');
      reveal.setAttribute('aria-controls', 'contact-panel');
      const actions = el('div', 'contact-actions');
      actions.append(reveal);
      contactCard.append(actions);
      const panel = el('div', 'contact-panel');
      panel.id = 'contact-panel';
      panel.hidden = true;
      const label = el('label', 'contact-note', CampusPosts.contactLabel(post));
      label.id = 'contact-kind';
      label.htmlFor = 'contact-value';
      const input = el('input', 'contact-input');
      input.id = 'contact-value';
      input.type = 'text';
      input.readOnly = true;
      input.value = contact;
      const copy = el('button', 'filter-button', '复制联系方式');
      copy.type = 'button';
      const copyActions = el('div', 'contact-actions');
      copyActions.append(copy);
      panel.append(label, input, copyActions, el('p', 'contact-note', '复制受限时可选中联系方式，使用 Ctrl+C（Mac 使用 ⌘C）手动复制。'));
      contactCard.append(panel);
      reveal.addEventListener('click', function () {
        panel.hidden = false;
        reveal.setAttribute('aria-expanded', 'true');
        reveal.hidden = true;
        input.focus();
      });
      copy.addEventListener('click', async function () {
        copy.disabled = true;
        let clipboard;
        try { clipboard = navigator.clipboard; } catch (error) { clipboard = null; }
        const copied = await copyText(contact, clipboard);
        copy.disabled = false;
        if (!input.isConnected) return;
        if (copied) CampusUI.toast('联系方式已复制');
        else {
          input.focus();
          input.select();
          CampusUI.toast('未能自动复制，已选中联系方式，请手动复制。');
        }
      });
    }
    container.append(contactCard);
  }

  return { render, backRoute, copyText };
});
