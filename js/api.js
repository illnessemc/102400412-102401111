(function () {
  'use strict';

  async function request(route, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/' + route, {
        method: options.method || 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: options.data === undefined ? {} : { 'Content-Type': 'application/json' },
        body: options.data === undefined ? undefined : JSON.stringify(options.data)
      });
      const result = await response.json();
      if (!result || typeof result.ok !== 'boolean' || (result.ok && !response.ok)) throw new Error('Invalid response');
      if (!result.ok && (!Array.isArray(result.errors) || !result.errors.every(error => typeof error === 'string'))) throw new Error('Invalid errors');
      return result;
    } catch (error) {
      return { ok: false, errors: ['校园信息服务暂时无法连接，请确认服务已启动后重试。'] };
    } finally { clearTimeout(timeout); }
  }

  window.CampusApi = { enabled: window.CAMPUS_BACKEND === true, request };
})();
