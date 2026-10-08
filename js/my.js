(function () {
  function finishStatus(post) {
    return post.type === 'lost' ? '已找到' : '已归还';
  }

  function renderStats(container) {
    const posts = window.CampusManage.getMyPosts();
    const total = posts.length;
    const ongoing = posts.filter(p => p.status !== '已找到' && p.status !== '已归还').length;
    const finished = total - ongoing;
    const statsEl = container.querySelector('#my-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div style="background:#e3f2fd;padding:12px;border-radius:8px;flex:1;min-width:100px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;">${total}</div><div style="font-size:12px;color:#666;">全部</div>
        </div>
        <div style="background:#fff3e0;padding:12px;border-radius:8px;flex:1;min-width:100px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;">${ongoing}</div><div style="font-size:12px;color:#666;">进行中</div>
        </div>
        <div style="background:#e8f5e9;padding:12px;border-radius:8px;flex:1;min-width:100px;text-align:center;">
          <div style="font-size:24px;font-weight:bold;">${finished}</div><div style="font-size:12px;color:#666;">已结束</div>
        </div>
      `;
    }
  }

  function renderCard(post) {
    const done = post.status === '已找到' || post.status === '已归还';
    const card = document.createElement('div');
    card.className = 'my-card';
    card.dataset.id = post.id;
    card.style.cssText = "border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px;background:" + (done ? '#f5f5f5' : '#fff') + ";";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <strong style="font-size:16px;">${post.name}</strong>
        <span style="background:${done ? '#ccc' : (post.type==='lost' ? '#ffebee' : '#e8f5e9')};padding:2px 8px;border-radius:12px;font-size:12px;">${post.status}</span>
      </div>
      <p style="margin:4px 0;color:#666;font-size:14px;">${post.place} · ${post.time}</p>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <a href="#detail?id=${encodeURIComponent(post.id)}&from=my" style="padding:4px 10px;background:#eee;border-radius:4px;text-decoration:none;font-size:13px;">查看详情</a>
        ${done ? '' : `<button data-action="finish" data-id="${post.id}" style="padding:4px 10px;background:#4caf50;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;">标记为${finishStatus(post)}</button>`}
        <button data-action="delete" data-id="${post.id}" style="padding:4px 10px;background:#f44336;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;">删除</button>
      </div>
    `;
    return card;
  }

  function render(container) {
    const posts = window.CampusManage.getMyPosts();
    container.innerHTML = `
      <div id="my-stats" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;"></div>
      <div style="margin-bottom:12px;">
        <label>筛选：
          <select id="my-filter" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;">
            <option value="all">全部</option>
            <option value="ongoing">进行中</option>
            <option value="finished">已结束</option>
          </select>
        </label>
      </div>
      <div id="my-cards"></div>
    `;

    renderStats(container);

    const cardsBox = container.querySelector('#my-cards');
    if (posts.length === 0) {
      cardsBox.innerHTML = '<p style="text-align:center;color:#999;padding:32px;">暂无发布记录，<a href="#publish">去发布第一条</a></p>';
    } else {
      posts.forEach(p => cardsBox.appendChild(renderCard(p)));
    }

    // 筛选
    const filterSel = container.querySelector('#my-filter');
    filterSel.addEventListener('change', function () {
      const cards = cardsBox.querySelectorAll('.my-card');
      cards.forEach(card => {
        const id = card.dataset.id;
        const post = window.CampusManage.getPostById(id);
        if (!post) return;
        const isDone = post.status === '已找到' || post.status === '已归还';
        const val = filterSel.value;
        const show = val === 'all' || (val === 'ongoing' && !isDone) || (val === 'finished' && isDone);
        card.style.display = show ? '' : 'none';
      });
    });

    // 操作按钮（防连点 + 局部更新）
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.loading === '1') return; // 防连点锁

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const card = cardsBox.querySelector('.my-card[data-id="' + id + '"]');
      const post = window.CampusManage.getPostById(id);
      if (!post) return;

      if (action === 'finish') {
        const newStatus = post.type === 'lost' ? '已找到' : '已归还';
        if (!confirm('确定标记为' + newStatus + '吗？')) return;
        btn.dataset.loading = '1';
        const r = window.CampusManage.updateStatus(id, newStatus);
        if (!r.ok) {
          alert(r.errors.join('\n'));
          btn.dataset.loading = '0';
          return;
        }
        window.dispatchEvent(new Event('campus:posts-changed'));
        // 局部替换卡片，不整体重绘，避免弹窗异常
        const newPost = window.CampusManage.getPostById(id);
        if (card && newPost) card.replaceWith(renderCard(newPost));
        renderStats(container);
      } else if (action === 'delete') {
        if (!confirm('确定删除这条发布吗？')) return;
        btn.dataset.loading = '1';
        const r2 = window.CampusManage.deletePost(id);
        if (!r2.ok) {
          alert(r2.errors.join('\n'));
          btn.dataset.loading = '0';
          return;
        }
        window.dispatchEvent(new Event('campus:posts-changed'));
        if (card) card.remove();
        renderStats(container);
        // 若删光了整体重绘显示空状态
        if (window.CampusManage.getMyPosts().length === 0) render(container);
      }
    });
  }

  window.MyModule = { render: render };
})();