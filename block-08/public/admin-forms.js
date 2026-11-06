// HTML remains server-rendered; this handler sends native PATCH/DELETE requests.
(() => {
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const method = form.querySelector('input[name="_method"]')?.value;
    if (method !== 'PATCH' && method !== 'DELETE') return;
    event.preventDefault();
    if (form.dataset.pending === 'true') return;

    const body = new FormData(form);
    body.delete('_method');
    const buttons = Array.from(form.querySelectorAll('button[type="submit"], button:not([type])'));
    form.dataset.pending = 'true';
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch(form.action, {
        method,
        body,
        redirect: 'manual',
        credentials: 'same-origin',
        headers: { Accept: 'text/html' }
      });
      if (response.type === 'opaqueredirect') {
        // Browsers hide Location for manual redirects. Navigate to this form's
        // known collection page; its auth guard also handles expired sessions.
        // Avoid following a successful mutation with an additional fetch GET.
        const destination = new URL(form.action, window.location.href);
        destination.pathname = destination.pathname.replace(/\/[1-9]\d*\/?$/, '');
        destination.search = '';
        destination.hash = '';
        window.location.assign(destination.href);
        return;
      }
      if (!(response.headers.get('content-type') || '').includes('text/html')) {
        throw new Error('Unexpected response');
      }
      // Render server validation/404/403 pages, preserving submitted values.
      // Delegation on document continues working after the DOM is replaced.
      const html = await response.text();
      const rendered = new DOMParser().parseFromString(html, 'text/html');
      document.documentElement.replaceWith(rendered.documentElement);
      window.scrollTo(0, 0);
      document.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' });
    } catch {
      let alert = form.querySelector('[data-request-error]');
      if (!alert) {
        alert = document.createElement('div');
        alert.className = 'alert';
        alert.dataset.requestError = 'true';
        alert.setAttribute('role', 'alert');
        form.prepend(alert);
      }
      alert.textContent = 'Chưa xác nhận được kết quả do lỗi kết nối. Hãy kiểm tra danh sách trước khi thử lại.';
      alert.scrollIntoView({ block: 'center' });
    } finally {
      delete form.dataset.pending;
      buttons.forEach(button => { button.disabled = false; });
    }
  });
})();
