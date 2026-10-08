(function () {
  'use strict';

  function render(container) {
    if (container.dataset.rendered) return;
    container.dataset.rendered = '1';

    container.innerHTML =
      '<form id="pub-form" style="max-width:480px;display:flex;flex-direction:column;gap:12px;padding:16px;background:#f8f9fa;border-radius:8px;">' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;">类型</label>' +
          '<select id="pub-type" required style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;">' +
            '<option value="lost">🔎 寻物（我丢了东西）</option>' +
            '<option value="found">📦 招领（我捡到东西）</option>' +
          '</select></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;">物品名称 *</label>' +
          '<input id="pub-name" required maxlength="50" placeholder="如：黑色长柄雨伞" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;">物品类别</label>' +
          '<input id="pub-category" maxlength="20" placeholder="如：雨伞、电子、书籍" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;" id="pub-place-label">丢失地点 *</label>' +
          '<input id="pub-place" required maxlength="50" placeholder="如：图书馆一楼" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;" id="pub-time-label">丢失时间 *</label>' +
          '<input id="pub-time" type="datetime-local" required style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;">联系方式 *</label>' +
          '<input id="pub-contact" required maxlength="50" placeholder="如：微信 xxx / 电话 138xxxx" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;"></div>' +
        '<div><label style="display:block;margin-bottom:4px;font-weight:bold;">描述</label>' +
          '<textarea id="pub-desc" rows="3" maxlength="200" placeholder="物品特征、颜色、品牌等" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;resize:vertical;"></textarea></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button type="submit" style="flex:1;padding:10px;background:#2f80ed;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;">发布</button>' +
          '<button type="button" id="pub-cancel" style="padding:10px;background:#ddd;color:#333;border:none;border-radius:6px;cursor:pointer;">取消</button>' +
        '</div>' +
      '</form>';

    var typeSel = container.querySelector('#pub-type');
    var placeLabel = container.querySelector('#pub-place-label');
    var timeLabel = container.querySelector('#pub-time-label');

    typeSel.addEventListener('change', function () {
      if (typeSel.value === 'found') {
        placeLabel.textContent = '拾取地点 *';
        timeLabel.textContent = '拾取时间 *';
      } else {
        placeLabel.textContent = '丢失地点 *';
        timeLabel.textContent = '丢失时间 *';
      }
    });

    container.querySelector('#pub-cancel').addEventListener('click', function () {
      location.hash = '#home';
    });

    container.querySelector('#pub-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        type: typeSel.value,
        name: container.querySelector('#pub-name').value,
        category: container.querySelector('#pub-category').value,
        place: container.querySelector('#pub-place').value,
        time: container.querySelector('#pub-time').value,
        contact: container.querySelector('#pub-contact').value,
        desc: container.querySelector('#pub-desc').value
      };
      var result = window.CampusManage.savePost(data);
      if (result.ok) {
        window.dispatchEvent(new Event('campus:posts-changed'));
        location.hash = '#success?id=' + encodeURIComponent(result.post.id);
      } else {
        alert('发布失败：\n' + result.errors.join('\n'));
      }
    });
  }

  function renderSuccess(container, params) {
    var postId = params.get('id');
    var postHtml = '';
    if (postId) {
      var post = window.CampusManage.getPostById(postId);
      if (post) {
        postHtml =
          '<div style="background:#e8f5e9;padding:16px;border-radius:8px;margin-bottom:16px;">' +
            '<p><strong>物品：</strong>' + post.name + '</p>' +
            '<p><strong>类型：</strong>' + (post.type === 'lost' ? '寻物' : '招领') + '</p>' +
            '<p><strong>地点：</strong>' + post.place + '</p>' +
            '<p><strong>状态：</strong>' + post.status + '</p>' +
          '</div>';
      }
    }
    container.innerHTML =
      '<div style="text-align:center;padding:32px 16px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">✅</div>' +
        '<h3 style="margin-bottom:16px;color:#2e7d32;">发布成功！</h3>' +
        postHtml +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px;">' +
          '<a href="#home" style="padding:10px 20px;background:#2f80ed;color:#fff;border-radius:6px;text-decoration:none;">返回首页</a>' +
          '<a href="#my" style="padding:10px 20px;background:#4caf50;color:#fff;border-radius:6px;text-decoration:none;">查看我的发布</a>' +
          '<a href="#publish" style="padding:10px 20px;background:#ff9800;color:#fff;border-radius:6px;text-decoration:none;">再发一条</a>' +
        '</div>' +
      '</div>';
  }

  window.PublishModule = { render: render, renderSuccess: renderSuccess };
})();