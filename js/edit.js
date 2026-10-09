(function () {
  'use strict';

  let editor;
  let loadedId = null;

  function returnRoute(from) {
    return typeof from === 'string' && from.split('?')[0] === 'my' ? from : 'my';
  }

  async function render(container, params, isCurrent = () => true) {
    const state = document.getElementById('edit-state');
    const id = params.get('id');
    const from = returnRoute(params.get('from'));
    if (!editor) {
      editor = PublishModule.createForm(container, 'edit');
      editor.lockType();
      editor.field('submit').textContent = '保存修改';
      editor.field('cancel').addEventListener('click', function () {
        loadedId = null;
        CampusUI.navigate(editor.form.dataset.from || 'my');
      });
      editor.form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (editor.form.dataset.submitting === '1' || !editor.validate()) return;
        const data = editor.getData();
        const recordId = editor.form.dataset.id;
        const back = editor.form.dataset.from;
        const route = location.hash;
        editor.setBusy(true);
        const result = await CampusManage.updatePost(recordId, data);
        editor.setBusy(false);
        if (!result.ok) {
          editor.showError(result.errors.join(' '));
          if (location.hash === route) editor.field('error').focus();
          else {
            CampusUI.toast(result.errors.join(' '));
            if (location.hash.startsWith('#edit')) CampusUI.navigate(location.hash.slice(1));
          }
          return;
        }
        loadedId = null;
        if (location.hash === route) CampusUI.navigate(back);
        CampusUI.toast('修改已保存');
        window.dispatchEvent(new Event('campus:posts-changed'));
      });
    }
    if (editor.form.dataset.submitting === '1') return;
    editor.form.dataset.from = from;
    if (id !== null && id === loadedId && !editor.form.hidden) return;
    editor.form.hidden = true;
    state.className = 'field-note';
    state.setAttribute('role', 'status');
    state.textContent = '正在读取发布记录…';
    state.hidden = false;
    const result = await CampusManage.getMyPosts();
    if (!isCurrent()) return;
    const post = result.ok ? CampusPosts.findPost(result.posts, id) : null;
    if (!post) {
      loadedId = null;
      state.className = 'form-error';
      state.setAttribute('role', 'alert');
      state.textContent = result.ok ? '这条信息不存在或不属于你，请从我的发布重新选择。 ' : result.errors.join(' ') + ' ';
      const back = CampusUI.element('a', '', '返回我的发布');
      back.href = '#' + from;
      state.append(back);
      return;
    }
    editor.setData({ ...post, time: CampusPosts.displayTime(post.time).replace(' ', 'T') });
    editor.form.dataset.id = String(post.id);
    loadedId = String(post.id);
    editor.setBusy(false);
    editor.form.hidden = false;
    state.hidden = true;
  }

  window.CampusEdit = { render };
})();
