(function () {
  'use strict';

  function updateLabels(container) {
    const found = container.querySelector('#pub-type').value === 'found';
    container.querySelector('#pub-place-label').textContent = (found ? '拾取' : '丢失') + '地点';
    container.querySelector('#pub-time-label').textContent = (found ? '拾取' : '丢失') + '时间';
  }

  function updateContact(container) {
    const type = container.querySelector('#pub-contactType').value;
    const input = container.querySelector('#pub-contact');
    container.querySelector('#pub-contact-label').textContent = CampusPosts.CONTACT_TYPES[type] || '号码 / 账号';
    input.placeholder = { wechat: '填写微信号', qq: '填写 QQ 号码', phone: '填写手机号码' }[type] || '先选择联系方式类型，再填写号码或账号';
    input.type = type === 'phone' ? 'tel' : 'text';
    input.inputMode = type === 'qq' || type === 'phone' ? 'tel' : 'text';
  }

  function render(container, params) {
    if (!container.dataset.rendered) {
      container.dataset.rendered = '1';
      container.innerHTML =
        '<form id="pub-form" class="publish-form">' +
          '<fieldset class="form-group"><legend>物品信息</legend><div class="form-fields">' +
          '<label class="field-wide" for="pub-type">信息类型<select id="pub-type" required><option value="lost">寻物（我丢了东西）</option><option value="found">招领（我捡到东西）</option></select></label>' +
          '<label for="pub-name">物品名称 <span class="required-mark" aria-hidden="true">*</span><input id="pub-name" required maxlength="50" placeholder="例如：黑色长柄雨伞"></label>' +
          '<label for="pub-category">物品类别<input id="pub-category" maxlength="20" placeholder="例如：雨伞、电子产品、书籍文具"></label>' +
          '<label for="pub-place"><span id="pub-place-label">丢失地点</span> <span class="required-mark" aria-hidden="true">*</span><input id="pub-place" required maxlength="50" placeholder="例如：图书馆一楼"></label>' +
          '<label for="pub-time"><span id="pub-time-label">丢失时间</span> <span class="required-mark" aria-hidden="true">*</span><input id="pub-time" type="datetime-local" required></label>' +
          '<label class="field-wide" for="pub-desc">物品描述<textarea id="pub-desc" rows="3" maxlength="200" placeholder="颜色、品牌和便于确认的特征"></textarea></label>' +
          '</div></fieldset>' +
          '<fieldset class="form-group"><legend>方便同学联系你</legend><div class="form-fields">' +
          '<label for="pub-contactType">联系方式类型 <span class="required-mark" aria-hidden="true">*</span><select id="pub-contactType" required><option value="">请选择联系方式</option><option value="wechat">微信</option><option value="qq">QQ</option><option value="phone">手机号</option></select></label>' +
          '<label for="pub-contact"><span id="pub-contact-label">号码 / 账号</span> <span class="required-mark" aria-hidden="true">*</span><input id="pub-contact" required maxlength="50" placeholder="先选择联系方式类型，再填写号码或账号"></label>' +
          '</div><p class="field-note">联系方式会显示在详情页，发布前请确认填写正确。</p></fieldset>' +
          '<p id="pub-error" class="form-error" role="alert" tabindex="-1" hidden></p>' +
          '<div class="form-actions"><button id="pub-submit" class="filter-button" type="submit">发布信息</button><button class="text-button" id="pub-cancel" type="button">取消</button></div>' +
        '</form>';
      const form = container.querySelector('#pub-form');
      const type = container.querySelector('#pub-type');
      const errorNote = container.querySelector('#pub-error');
      const submit = container.querySelector('#pub-submit');
      type.addEventListener('change', function () { updateLabels(container); });
      container.querySelector('#pub-contactType').addEventListener('change', function () { updateContact(container); });
      container.querySelector('#pub-cancel').addEventListener('click', function () { CampusUI.navigate('home'); });
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (form.dataset.submitting === '1') return;
        form.dataset.submitting = '1';
        submit.disabled = true;
        errorNote.hidden = true;
        const data = {};
        ['type', 'name', 'category', 'place', 'time', 'contactType', 'contact', 'desc'].forEach(function (field) {
          data[field] = container.querySelector('#pub-' + field).value;
        });
        const route = location.hash;
        Array.from(form.elements).forEach(control => { control.disabled = true; });
        const result = await CampusManage.savePost(data);
        if (!result.ok) {
          errorNote.textContent = result.errors.join(' ');
          errorNote.hidden = false;
          errorNote.focus();
          form.dataset.submitting = '0';
          Array.from(form.elements).forEach(control => { control.disabled = false; });
          return;
        }
        form.reset();
        updateLabels(container);
        updateContact(container);
        form.dataset.saved = '1';
        // Keep the successful submission locked until the next visit to this form.
        if (location.hash === route) CampusUI.navigate('success?id=' + encodeURIComponent(result.post.id));
        else CampusUI.toast('信息已发布，可在我的发布中查看。');
        window.dispatchEvent(new Event('campus:posts-changed'));
      });
    }
    const form = container.querySelector('#pub-form');
    if (form.dataset.saved === '1') {
      form.dataset.saved = '0';
      form.dataset.submitting = '0';
      Array.from(form.elements).forEach(control => { control.disabled = false; });
    }
    const type = params.get('type');
    if (form.dataset.submitting !== '1' && (type === 'lost' || type === 'found')) container.querySelector('#pub-type').value = type;
    updateLabels(container);
    updateContact(container);
  }

  async function renderSuccess(container, params, isCurrent = () => true) {
    const el = CampusUI.element;
    container.replaceChildren();
    const records = await CampusManage.getMyPosts();
    if (!isCurrent()) return;
    if (!records.ok) {
      container.append(el('p', 'form-error', records.errors.join(' ')));
      return;
    }
    const post = CampusPosts.findPost(records.posts, params.get('id'));
    if (!post) {
      const empty = el('div', 'empty');
      const back = el('a', 'back-link', '查看我的发布');
      back.href = '#my';
      empty.append(el('h2', '', '这条发布记录不存在或已被删除'), el('p', '', '请在我的发布中查看当前发布者的记录。'), back);
      container.append(empty);
      return;
    }
    const found = post.type === 'found';
    const done = CampusPosts.isFinished(post);
    const layout = el('div', 'success-layout');
    const card = el('article', 'success-card');
    const intro = el('div', 'success-intro');
    const symbol = el('span', 'success-symbol', '✓');
    symbol.setAttribute('aria-hidden', 'true');
    const heading = el('h2', 'success-title', '发布成功！');
    heading.tabIndex = -1;
    const message = el('div', 'success-message');
    const copy = done ? '这条信息已经结束，记录仍可在我的发布和历史搜索中查看。' : found ?
      '谢谢你留下这条招领线索。小小的善意，让物品多一次回家的机会。' :
      '寻物信息已经保存。愿这条线索，帮你早一点找回熟悉的物品。';
    message.append(heading, el('p', '', copy));
    intro.append(symbol, message);

    const preview = el('section', 'success-preview');
    const previewHeading = el('div', 'success-preview-heading');
    previewHeading.append(el('h3', '', post.name), el('span', 'badge ' + (done ? 'done' : post.type), post.status));
    preview.append(el('p', 'context-eyebrow', '这次发布的信息'), previewHeading,
      el('p', 'success-category', (found ? '招领信息' : '寻物信息') + (post.category ? ' · ' + post.category : '')));
    const summary = el('dl', 'detail-grid');
    [[found ? '拾取地点' : '丢失地点', post.place], [found ? '拾取时间' : '丢失时间', CampusPosts.displayTime(post.time)], ['联系类型', CampusPosts.contactLabel(post)]].forEach(function ([label, value]) {
      summary.append(el('dt', '', label), el('dd', '', value));
    });
    preview.append(summary);
    const actions = el('div', 'success-actions');
    const detailRoute = 'detail?' + new URLSearchParams({ id: String(post.id), from: 'my' }).toString();
    [['my', '查看我的发布', 'action-primary'], [detailRoute, '查看这条信息', 'action-secondary']].forEach(function ([route, label, style]) {
      const link = el('a', 'action-link ' + style, label);
      link.href = '#' + route;
      actions.append(link);
    });
    const footer = el('div', 'success-footer');
    [['home', '返回首页'], ['publish', '再发一条']].forEach(function ([route, label]) {
      const link = el('a', '', label);
      link.href = '#' + route;
      footer.append(link);
    });
    card.append(intro, preview, actions, footer);

    const next = el('aside', 'context-card success-next');
    const nextHeading = el('h2', '', '接下来，慢慢来');
    nextHeading.id = 'success-next-heading';
    next.setAttribute('aria-labelledby', nextHeading.id);
    next.append(el('p', 'context-eyebrow', '接下来可以做什么'), nextHeading);
    const steps = el('ol', 'next-steps');
    [['再核对一遍', '确认物品特征、地点和联系账号都填写正确。'],
      ['联系时确认特征', '通过详情里的联系方式沟通，核对后再认领或归还。'],
      [done ? '记录已经结束' : '有结果就更新状态', done ? '需要回看时，在搜索中勾选包括已结束的信息。' :
        '到我的发布标记“' + (found ? '已归还' : '已找到') + '”，让同学少一次等待。']].forEach(function ([title, text]) {
      const step = el('li', '');
      step.append(el('strong', '', title), el('p', '', text));
      steps.append(step);
    });
    next.append(steps);
    layout.append(card, next);
    container.append(layout);
    heading.focus({ preventScroll: true });
  }

  window.PublishModule = { render, renderSuccess };
})();
