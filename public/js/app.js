// public/js/app.js — router, views, list, detail, share page, settings, PWA
/* global $, $$, el, escapeHtml, icon, hydrateIcons, toast, openModal, confirmDialog,
   copyToClipboard, timeAgo, expiryLabel, TYPE_META, Theme, applyTheme, Auth, api, ApiError,
   openClipEditor, openQrModal */
'use strict';

const state = {
  view: 'all',        // all | favorites | pinned | history
  q: '',
  tag: null,
  type: '',
  sort: 'created',
  items: [],
  tags: [],
};

let listTimer = null;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function navigate(path) {
  if (location.pathname !== path) history.pushState({}, '', path);
  route();
}

function route() {
  const path = location.pathname;
  closeDrawer();
  if (path.startsWith('/s/')) {
    const token = decodeURIComponent(path.slice(3));
    showShareView(token);
    return;
  }
  if (path === '/login') {
    if (Auth.isLoggedIn) { navigate('/'); return; }
    showAuthView();
    return;
  }
  // default: main app
  if (!Auth.isLoggedIn) { history.replaceState({}, '', '/login'); showAuthView(); return; }
  showMainView();
}

window.addEventListener('popstate', route);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function hideAllViews() {
  ['#view-auth', '#view-main', '#view-share'].forEach((s) => $(s).classList.add('hidden'));
}

function showAuthView() {
  hideAllViews();
  $('#view-auth').classList.remove('hidden');
}

function showMainView() {
  hideAllViews();
  $('#view-main').classList.remove('hidden');
  $('#user-name').textContent = Auth.user ? Auth.user.username : '';
  $('#user-full').textContent = Auth.user ? '@' + Auth.user.username : '';
  $('#user-email').textContent = Auth.user ? Auth.user.email : '';
  refreshSidebar();
  loadList();
}

function showShareView(token) {
  hideAllViews();
  $('#view-share').classList.remove('hidden');
  renderShare(token);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function wireAuth() {
  $$('#auth-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('#auth-tabs .tab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const isLogin = tab.dataset.authTab === 'login';
      $('#form-login').classList.toggle('hidden', !isLogin);
      $('#form-register').classList.toggle('hidden', isLogin);
    });
  });

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const $err = $('#login-error');
    $err.classList.add('hidden');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: {
          identifier: $('#login-identifier').value.trim(),
          password: $('#login-password').value,
        },
      });
      Auth.save(data.token, data.user);
      toast(`Welcome back, ${data.user.username}`, 'success');
      navigate('/');
    } catch (err) {
      $err.textContent = err.message;
      $err.classList.remove('hidden');
    }
  });

  $('#form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const $err = $('#register-error');
    $err.classList.add('hidden');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          username: $('#reg-username').value.trim(),
          email: $('#reg-email').value.trim(),
          password: $('#reg-password').value,
        },
      });
      Auth.save(data.token, data.user);
      toast('Account created — welcome!', 'success');
      navigate('/');
    } catch (err) {
      $err.textContent = err.message;
      $err.classList.remove('hidden');
    }
  });
}

function logout() {
  Auth.clear();
  toast('Signed out');
  navigate('/login');
}

// ---------------------------------------------------------------------------
// Sidebar & filters
// ---------------------------------------------------------------------------
async function refreshSidebar() {
  try {
    const [tagsData, statsData] = await Promise.all([
      api('/api/clips/tags'),
      api('/api/clips/stats'),
    ]);
    state.tags = tagsData.tags || [];
    const $cloud = $('#tag-list');
    if (!state.tags.length) {
      $cloud.innerHTML = '<span class="muted small">No tags yet</span>';
    } else {
      $cloud.replaceChildren(...state.tags.map((t) =>
        el('button', { class: `chip small ${state.tag === t.tag ? 'active' : ''}`,
          onclick: () => { state.tag = state.tag === t.tag ? null : t.tag; state.view = 'all'; markActiveNav(); loadList(); } },
          `${t.tag} · ${t.count}`)));
    }
    const stats = statsData.stats || statsData;
    $('#count-all').textContent = stats.total || '';
    $('#count-fav').textContent = stats.favorites || '';
    $('#side-stats').textContent =
      `${stats.total} clips · ${stats.copies} copies · ${stats.views} share views`;
  } catch { /* non-fatal */ }
}

function markActiveNav() {
  $$('.side-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.view));
  $$('#type-filter .chip').forEach((c) => c.classList.toggle('active', c.dataset.type === state.type));
  $('#sort-select').value = state.sort;
}

function wireSidebar() {
  $$('.side-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.nav;
      state.tag = null;
      markActiveNav();
      loadList();
      closeDrawer();
    });
  });
  $$('#type-filter .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.type = chip.dataset.type;
      markActiveNav();
      loadList();
    });
  });
  $('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; loadList(); });
  $('#btn-new').addEventListener('click', () => openClipEditor({ onSaved: afterSave }));
  $('#btn-fab').addEventListener('click', () => openClipEditor({ onSaved: afterSave }));
  $('#btn-menu').addEventListener('click', openDrawer);
  $('#sidebar-overlay').addEventListener('click', closeDrawer);
  $('#import-file').addEventListener('change', handleImport);

  $$('[data-action]').forEach((btn) => {
    const action = btn.dataset.action;
    if (action === 'export') btn.addEventListener('click', doExport);
    if (action === 'import') btn.addEventListener('click', () => $('#import-file').click());
    if (action === 'new') btn.addEventListener('click', () => openClipEditor({ onSaved: afterSave }));
    if (btn.closest('.user-menu')) {
      if (action === 'settings') btn.addEventListener('click', () => { toggleUserMenu(false); openSettings(); });
      if (action === 'export') btn.addEventListener('click', () => { toggleUserMenu(false); doExport(); });
      if (action === 'logout') btn.addEventListener('click', () => { toggleUserMenu(false); logout(); });
    }
  });

  $('#btn-user').addEventListener('click', () => toggleUserMenu());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) toggleUserMenu(false);
  });
  $('#btn-theme').addEventListener('click', () => Theme.toggle());
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(listTimer);
    listTimer = setTimeout(() => { state.q = e.target.value.trim(); loadList(); }, 250);
  });
}

function afterSave() {
  loadList();
  refreshSidebar();
}

function openDrawer() {
  $('#sidebar').classList.add('open');
  $('#sidebar-overlay').classList.remove('hidden');
}
function closeDrawer() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.add('hidden');
}

function toggleUserMenu(force) {
  const dd = $('#user-dropdown');
  const btn = $('#btn-user');
  const show = force !== undefined ? force : dd.classList.contains('hidden');
  dd.classList.toggle('hidden', !show);
  if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
async function loadList() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.tag) params.set('tag', state.tag);
  if (state.type) params.set('type', state.type);
  if (state.view === 'favorites') params.set('favorite', '1');
  if (state.view === 'pinned') params.set('pinned', '1');
  params.set('sort', state.sort);

  try {
    const data = await api(`/api/clips?${params}`);
    state.items = data.items || [];
    renderList();
  } catch (err) {
    if (err.status === 401) return;
    toast(err.message, 'error');
  }
}

function renderList() {
  const $list = $('#clip-list');
  const $empty = $('#empty-state');
  let items = state.items;

  $list.classList.toggle('history-mode', state.view === 'history');

  if (state.view === 'history') {
    items = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (!items.length) {
    $list.replaceChildren();
    $empty.classList.remove('hidden');
    const filtered = state.q || state.tag || state.type || state.view !== 'all';
    $('#empty-title').textContent = filtered ? 'Nothing found' : 'No clips yet';
    $('#empty-hint').textContent = filtered
      ? 'Try a different search, tag or filter.'
      : 'Create your first clip — paste text, write rich content or code.';
    $('[data-action="new"]', $empty).classList.toggle('hidden', !!filtered);
    return;
  }
  $empty.classList.add('hidden');

  if (state.view === 'history') {
    const groups = new Map();
    for (const item of items) {
      const d = new Date(item.createdAt);
      const key = d.toDateString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const frag = document.createDocumentFragment();
    for (const [day, dayItems] of groups) {
      frag.append(el('div', { class: 'history-day' }, prettyDay(day)));
      dayItems.forEach((item) => frag.append(renderCard(item)));
    }
    $list.replaceChildren(frag);
  } else {
    $list.replaceChildren(...items.map(renderCard));
  }
}

function prettyDay(dayString) {
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 864e5).toDateString();
  if (dayString === today) return 'Today';
  if (dayString === yest) return 'Yesterday';
  return new Date(dayString).toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function renderCard(item) {
  const meta = TYPE_META[item.contentType] || TYPE_META.text;
  const badges = [];
  if (item.shareEnabled) badges.push(`<span class="badge">${icon('link')} shared</span>`);
  if (item.isOneTime && item.shareEnabled) badges.push(`<span class="badge warn">${icon('clock')} one-time</span>`);
  if (item.hasPassword && item.shareEnabled) badges.push(`<span class="badge">${icon('lock')}</span>`);
  if (item.expired) badges.push('<span class="badge danger">expired</span>');
  else if (item.expiresAt) badges.push(`<span class="badge">${icon('clock')} ${escapeHtml(expiryLabel(item.expiresAt) || '')}</span>`);

  const card = el('article', {
    class: `clip-card ${item.isPinned ? 'pinned' : ''}`,
    onclick: () => openDetail(item.id),
  });
  card.innerHTML = `
    <div class="card-top">
      <span class="type-ico ${item.contentType}">${icon(meta.icon)}</span>
      <h3 class="card-title">${escapeHtml(item.title || 'Untitled clip')}</h3>
      <button class="btn icon ghost fav-btn ${item.isFavorite ? 'on' : ''}" data-fav aria-label="Favorite">${icon('star')}</button>
    </div>
    <div class="card-body ${item.contentType}">${escapeHtml(item.excerpt || '')}</div>
    <div class="card-tags">${(item.tags || []).map((t) => `<span class="chip tiny">#${escapeHtml(t)}</span>`).join('')}</div>
    <div class="card-foot">
      <span class="muted small">${timeAgo(item.createdAt)}</span>
      <span class="muted small copy-info">${item.copyCount ? icon('copy') + ' ' + item.copyCount : ''}</span>
      <div class="card-actions">
        <button class="btn icon ghost" data-copy aria-label="Copy">${icon('copy')}</button>
        ${item.shareEnabled ? `<button class="btn icon ghost" data-share aria-label="Share link">${icon('share')}</button>` : ''}
      </div>
    </div>
    <div class="badges">${badges.join('')}</div>
  `;

  hydrateIcons(card);
  $('[data-fav]', card).addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    try {
      const updated = await api(`/api/clips/${item.id}/flags`, { method: 'PATCH', body: { isFavorite: !item.isFavorite } });
      item.isFavorite = updated.isFavorite;
      btn.classList.toggle('on', updated.isFavorite);
      refreshSidebar();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-copy]', card).addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const full = await api(`/api/clips/${item.id}`);
      const text = full.contentType === 'richtext' ? htmlToText(full.content) : full.content;
      await copyToClipboard(text);
      await api(`/api/clips/${item.id}/copy`, { method: 'PATCH' }).catch(() => {});
      toast('Copied to clipboard', 'success');
      loadList();
    } catch (err) { toast(err.message, 'error'); }
  });
  const $share = $('[data-share]', card);
  if ($share) $share.addEventListener('click', (e) => { e.stopPropagation(); openDetail(item.id, { focusShare: true }); });
  return card;
}

function htmlToText(html) {
  const d = el('div', {});
  d.innerHTML = html;
  return d.textContent || '';
}

function afterListButtons() {}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------
async function openDetail(id, { focusShare = false } = {}) {
  let clip;
  try {
    clip = await api(`/api/clips/${id}`);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const body = el('div', { class: 'detail-body' });
  const modal = openModal(body);

  const meta = TYPE_META[clip.contentType] || TYPE_META.text;
  const badges = [
    `<span class="badge">${icon(meta.icon)} ${meta.label}</span>`,
    clip.copyCount ? `<span class="badge">${icon('copy')} ${clip.copyCount}</span>` : '',
    clip.viewCount ? `<span class="badge">${icon('eye')} ${clip.viewCount}</span>` : '',
    clip.expiresAt ? `<span class="badge ${clip.expired ? 'danger' : ''}">${icon('clock')} ${escapeHtml(expiryLabel(clip.expiresAt) || 'Expired')}</span>` : '',
    clip.shareEnabled && clip.isOneTime ? `<span class="badge warn">${icon('clock')} one-time</span>` : '',
  ].filter(Boolean).join('');

  body.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(clip.title || 'Untitled clip')}</h2>
        <div class="badges">${badges}</div>
      </div>
    </div>
    <div class="detail-content" id="detail-content"></div>
    <div class="detail-meta muted small">Created ${timeAgo(clip.createdAt)} · Updated ${timeAgo(clip.updatedAt)}</div>
    <div id="detail-share" class="${focusShare ? '' : 'hidden'}"></div>
    <div class="row gap end wrap detail-actions">
      <button class="btn" id="dt-copy">${icon('copy')} Copy</button>
      <button class="btn" id="dt-edit">${icon('edit')} Edit</button>
      <button class="btn" id="dt-share">${icon('share')} Share</button>
      <button class="btn" id="dt-qr">${icon('qr')} QR</button>
      <a class="btn" id="dt-dl" href="/api/clips/${clip.id}/export" download>${icon('download')} Save</a>
      <span class="detail-icon-actions">
        <button class="btn icon ${clip.isFavorite ? 'fav-on' : ''}" id="dt-fav" aria-label="Favorite" aria-pressed="${clip.isFavorite}">${icon('star')}</button>
        <button class="btn icon ${clip.isPinned ? 'fav-on' : ''}" id="dt-pin" aria-label="Pin" aria-pressed="${clip.isPinned}">${icon('pin')}</button>
      </span>
    </div>
  `;
  hydrateIcons(body);

  const $content = $('#detail-content', body);
  renderClipContent($content, clip);

  $('#dt-copy', body).addEventListener('click', async () => {
    const text = clip.contentType === 'richtext' ? htmlToText(clip.content) : clip.content;
    await copyToClipboard(text);
    await api(`/api/clips/${clip.id}/copy`, { method: 'PATCH' }).catch(() => {});
    toast('Copied to clipboard', 'success');
  });
  $('#dt-edit', body).addEventListener('click', () => {
    modal.close();
    openClipEditor({ clip, onSaved: afterSave });
  });
  $('#dt-fav', body).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const updated = await api(`/api/clips/${clip.id}/flags`, { method: 'PATCH', body: { isFavorite: !clip.isFavorite } });
    clip.isFavorite = updated.isFavorite;
    btn.classList.toggle('fav-on', updated.isFavorite);
    btn.setAttribute('aria-pressed', String(updated.isFavorite));
    loadList(); refreshSidebar();
  });
  $('#dt-pin', body).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const updated = await api(`/api/clips/${clip.id}/flags`, { method: 'PATCH', body: { isPinned: !clip.isPinned } });
    clip.isPinned = updated.isPinned;
    btn.classList.toggle('fav-on', updated.isPinned);
    btn.setAttribute('aria-pressed', String(updated.isPinned));
    loadList();
  });
  $('#dt-share', body).addEventListener('click', () => {
    const $share = $('#detail-share', body);
    $share.classList.remove('hidden');
    renderSharePanel($share, clip);
  });
  $('#dt-qr', body).addEventListener('click', async () => {
    if (!clip.shareEnabled) {
      const ok = await confirmDialog('Enable a share link for this clip so a QR code can be generated?', { danger: false, confirmText: 'Enable' });
      if (!ok) return;
      const updated = await api(`/api/clips/${clip.id}/share`, { method: 'POST', body: { enabled: true } });
      openQrModal(clip.id, updated.shareUrl);
      loadList();
    } else {
      openQrModal(clip.id, clip.shareUrl || `${location.origin}/s/…`);
    }
  });

  if (focusShare) {
    const $share = $('#detail-share', body);
    $share.classList.remove('hidden');
    renderSharePanel($share, clip);
  }
}

function renderClipContent($container, clip) {
  if (clip.contentType === 'richtext') {
    const rich = el('div', { class: 'rich-view' });
    rich.innerHTML = clip.content; // sanitized server-side
    $container.replaceChildren(rich);
    return;
  }
  if (clip.contentType === 'code') {
    const pre = el('pre', { class: 'code-view' });
    const code = el('code', {});
    code.textContent = clip.content;
    pre.append(code);
    $container.replaceChildren(pre);
    if (window.hljs) {
      try {
        if (clip.language && hljs.getLanguage(clip.language)) {
          code.innerHTML = hljs.highlight(clip.content, { language: clip.language }).value;
        } else {
          code.innerHTML = hljs.highlightAuto(clip.content).value;
        }
        code.classList.add('hljs');
      } catch { /* keep plain */ }
    }
    return;
  }
  const pre = el('div', { class: 'text-view' });
  pre.textContent = clip.content;
  $container.replaceChildren(pre);
}

function renderSharePanel($panel, clip) {
  const url = clip.shareUrl || (clip.shareEnabled ? `${location.origin}/s/…` : null);
  $panel.innerHTML = `
    <div class="share-panel">
      <div class="row gap between">
        <strong>${icon('share')} Share link</strong>
        ${clip.shareEnabled ? `<button class="btn danger small" id="sh-disable">Disable</button>`
                            : `<button class="btn primary small" id="sh-enable">Create link</button>`}
      </div>
      ${clip.shareEnabled && url ? `
        <div class="share-link-row">
          <input class="input" readonly value="${escapeHtml(url)}">
          <button class="btn icon" id="sh-copy">${icon('copy')}</button>
          <button class="btn icon" id="sh-qr">${icon('qr')}</button>
        </div>
        <div class="share-opts">
          <label class="switch-row"><input type="checkbox" id="sh-onetime" ${clip.isOneTime ? 'checked' : ''}><span class="switch"></span>One-time link</label>
          <label class="field grow"><span>New password (optional)</span>
            <input type="password" class="input" id="sh-pass" placeholder="${clip.hasPassword ? 'Leave empty to keep current' : 'No password set'}"></label>
          <button class="btn small" id="sh-apply">Apply</button>
        </div>` : `<p class="muted small">Share links let anyone with the URL view this clip. Optional password and one-time burn supported.</p>`}
    </div>`;
  hydrateIcons($panel);

  const enable = async (extra = {}) => {
    const updated = await api(`/api/clips/${clip.id}/share`, { method: 'POST', body: { enabled: true, ...extra } });
    Object.assign(clip, updated);
    renderSharePanel($panel, clip);
    loadList(); refreshSidebar();
    toast('Share link is live', 'success');
    return updated;
  };

  const $enable = $('#sh-enable', $panel);
  if ($enable) $enable.addEventListener('click', () => enable().catch((e) => toast(e.message, 'error')));
  const $disable = $('#sh-disable', $panel);
  if ($disable) $disable.addEventListener('click', async () => {
    await api(`/api/clips/${clip.id}/share`, { method: 'POST', body: { enabled: false } });
    clip.shareEnabled = false; clip.shareUrl = null;
    renderSharePanel($panel, clip); loadList(); refreshSidebar();
    toast('Sharing disabled');
  });
  const $copy = $('#sh-copy', $panel);
  if ($copy) $copy.addEventListener('click', async () => { await copyToClipboard(url); toast('Link copied', 'success'); });
  const $qr = $('#sh-qr', $panel);
  if ($qr) $qr.addEventListener('click', () => openQrModal(clip.id, url));
  const $apply = $('#sh-apply', $panel);
  if ($apply) $apply.addEventListener('click', async () => {
    const body = { enabled: true, oneTime: $('#sh-onetime', $panel).checked };
    const pw = $('#sh-pass', $panel).value;
    if (pw) body.password = pw;
    try { await enable(body); } catch (e) { toast(e.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------
function doExport() {
  const a = el('a', { href: '/api/clips/export', download: '' });
  document.body.append(a);
  a.click();
  a.remove();
  toast('Export started', 'success');
}

async function handleImport(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed) && parsed.items) parsed = parsed.items;
    if (!Array.isArray(parsed)) throw new Error('File must contain an items array');
    const result = await api('/api/clips/import', { method: 'POST', body: { items: parsed } });
    toast(`Imported ${result.imported} clips${result.errors.length ? `, ${result.errors.length} skipped` : ''}`, 'success');
    loadList(); refreshSidebar();
  } catch (err) {
    toast(`Import failed: ${err.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function openSettings() {
  const body = el('div', { class: 'settings-body' }, [
    el('h3', {}, 'Settings'),
    el('div', { class: 'settings-row' }, [
      el('span', {}, 'Appearance'),
      el('button', { class: 'btn', id: 'st-theme', html: `${icon(Theme.get() === 'dark' ? 'sun' : 'moon')} ${Theme.get() === 'dark' ? 'Switch to light' : 'Switch to dark'}` }),
    ]),
    el('hr'),
    el('h4', {}, 'Change password'),
    el('form', { class: 'stack', id: 'st-pass-form' }, [
      el('input', { class: 'input', type: 'password', placeholder: 'Current password', 'aria-label': 'Current password', required: true, autocomplete: 'current-password' }),
      el('input', { class: 'input', type: 'password', placeholder: 'New password', 'aria-label': 'New password', required: true, minlength: 8, autocomplete: 'new-password' }),
      el('input', { class: 'input', type: 'password', placeholder: 'Confirm new password', 'aria-label': 'Confirm new password', required: true, minlength: 8, autocomplete: 'new-password' }),
      el('p', { class: 'form-error hidden' }),
      el('button', { class: 'btn primary', type: 'submit' }, 'Update password'),
    ]),
    el('hr'),
    el('p', { class: 'muted small' }, 'Signing out everywhere invalidates other sessions after a password change.'),
    el('div', { class: 'row gap end' }, [
      el('button', { class: 'btn danger', id: 'st-logout', html: `${icon('logout')} Sign out` }),
    ]),
  ]);
  hydrateIcons(body);
  const modal = openModal(body);

  $('#st-theme', body).addEventListener('click', () => {
    Theme.toggle();
    $('#st-theme', body).innerHTML = `${icon(Theme.get() === 'dark' ? 'sun' : 'moon')} ${Theme.get() === 'dark' ? 'Switch to light' : 'Switch to dark'}`;
  });
  $('#st-logout', body).addEventListener('click', () => { modal.close(); logout(); });
  $('#st-pass-form', body).addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = $$('input', body);
    const [current, next, confirm2] = inputs;
    const $err = $('.form-error', body);
    $err.classList.add('hidden');
    if (next.value !== confirm2.value) {
      $err.textContent = 'New passwords do not match';
      $err.classList.remove('hidden');
      return;
    }
    try {
      const data = await api('/api/auth/password', {
        method: 'PUT',
        body: { currentPassword: current.value, newPassword: next.value },
      });
      Auth.save(data.token, Auth.user);
      toast('Password updated', 'success');
      modal.close();
    } catch (err) {
      $err.textContent = err.message;
      $err.classList.remove('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// Share view (public)
// ---------------------------------------------------------------------------
async function renderShare(token) {
  const $box = $('#share-content');
  $box.innerHTML = shareSkeleton();

  let meta;
  try {
    meta = await api(`/api/share/${encodeURIComponent(token)}/meta`);
  } catch (err) {
    $box.innerHTML = shareError(err);
    return;
  }

  const typeMeta = TYPE_META[meta.contentType] || TYPE_META.text;
  const badges = [
    `<span class="badge">${icon(typeMeta.icon)} ${typeMeta.label}</span>`,
    meta.hasPassword ? `<span class="badge">${icon('lock')} password</span>` : '',
    meta.isOneTime ? `<span class="badge warn">${icon('clock')} one-time</span>` : '',
    meta.expiresAt ? `<span class="badge">${icon('clock')} ${escapeHtml(expiryLabel(meta.expiresAt) || '')}</span>` : '',
  ].filter(Boolean).join('');

  $box.innerHTML = `
    <div class="share-card">
      <div class="share-brand"><a href="/">${icon('clipboard')} Online Clipboard</a></div>
      <h1 class="share-title">${escapeHtml(meta.title || 'Shared clip')}</h1>
      <div class="badges">${badges}</div>
      <p class="muted small">${meta.excerpt ? escapeHtml(meta.excerpt.slice(0, 120)) : ''}</p>
      <div id="share-body"></div>
      <div class="share-foot muted small">This content was shared with you via a secure link.</div>
    </div>`;

  const $shareBody = $('#share-body', $box);

  const unlock = async (password) => {
    try {
      const data = await api(`/api/share/${encodeURIComponent(token)}/access`, {
        method: 'POST',
        body: password === undefined ? {} : { password },
      });
      renderSharedContent($shareBody, data);
      hydrateIcons($shareBody);
    } catch (err) {
      if (err.data && err.data.needsPassword) {
        renderPasswordForm($shareBody, unlock);
      } else {
        $shareBody.innerHTML = `<div class="share-notice error">${icon('alert')} ${escapeHtml(err.message)}</div>`;
      }
    }
  };
  hydrateIcons($box);
  unlock();
}

function shareSkeleton() {
  return `<div class="share-card"><div class="skeleton line w60"></div><div class="skeleton line"></div><div class="skeleton line w80"></div></div>`;
}

function shareError(err) {
  const isGone = err.status === 410;
  return `
    <div class="share-card center">
      <div class="share-brand"><a href="/">Online Clipboard</a></div>
      <div class="share-notice error big">${icon(isGone ? 'clock' : 'alert')} ${escapeHtml(err.message)}</div>
      <a class="btn primary" href="/">Open Online Clipboard</a>
    </div>`;
}

function renderPasswordForm($box, unlock) {
  $box.innerHTML = `
    <form class="stack share-unlock" id="share-pass-form">
      <label class="field"><span>${'This clip is protected'}</span>
        <div class="share-link-row">
          <input type="password" class="input" id="share-pass" placeholder="Enter password" autocomplete="off" required>
          <button class="btn primary" type="submit">${icon('unlock')} Unlock</button>
        </div>
      </label>
      <p class="form-error hidden"></p>
    </form>`;
  hydrateIcons($box);
  $('#share-pass', $box).focus();
  $('#share-pass-form', $box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#share-pass', $box).value;
    const $err = $('.form-error', $box);
    $err.classList.add('hidden');
    await unlock(pw);
    if ($('.share-unlock', $box) && !$err.classList.contains('hidden') === false) { /* state handled in unlock */ }
  });
}

function renderSharedContent($box, data) {
  const wrap = el('div', { class: 'shared-content' });
  renderClipContent(wrap, data);
  const note = data.consumed
    ? el('div', { class: 'share-notice warn', html: `${icon('clock')} One-time link — this content will not be shown again.` })
    : null;

  const actions = el('div', { class: 'row gap share-actions' }, [
    el('button', { class: 'btn primary', html: `${icon('copy')} Copy to clipboard`, onclick: async (e) => {
      const btn = e.currentTarget;
      const text = data.contentType === 'richtext' ? htmlToText(data.content) : data.content;
      await copyToClipboard(text);
      btn.innerHTML = `${icon('check')} Copied`;
      hydrateIcons(btn);
      setTimeout(() => { btn.innerHTML = `${icon('copy')} Copy to clipboard`; hydrateIcons(btn); }, 2000);
    } }),
    el('a', { class: 'btn', href: '#', id: 'share-download', html: `${icon('download')} Download` }),
  ]);

  $box.replaceChildren(...(note ? [note, wrap, actions] : [wrap, actions]));
  const ext = data.contentType === 'code' ? 'txt' : data.contentType === 'richtext' ? 'html' : 'txt';
  $('#share-download', $box).addEventListener('click', (e) => {
    e.preventDefault();
    const blob = new Blob([data.contentType === 'richtext' ? htmlToText(data.content) : data.content],
      { type: 'text/plain;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `shared-clip.${ext}` });
    document.body.append(a); a.click(); a.remove();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(Theme.get());
  hydrateIcons(document);
  wireAuth();
  wireSidebar();
  window.addEventListener('auth:logout', () => { if (!location.pathname.startsWith('/s/')) navigate('/login'); });
  route();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support unavailable */ });
    });
  }
});
