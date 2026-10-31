// public/js/common.js — shared utilities: API, icons, toasts, modals, theme
/* global Quill */
'use strict';

// ---------- tiny DOM helpers ----------
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('\x26', '\x26amp;')
    .replaceAll('\x3C', '\x26lt;')
    .replaceAll('\x3E', '\x26gt;')
    .replaceAll('"', '\x26quot;')
    .replaceAll("'", '\x26#39;');
}

// ---------- icon set (inline SVG, stroke style) ----------
const ICONS = {
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  pin: '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.33 1.88l-.75.27A2 2 0 0 0 5.55 15v1h12.9v-1a2 2 0 0 0-1.37-2.09l-.75-.27A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M17 17l4 4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  text: '<path d="M17 6.1H3M21 12.1H3M15.5 18.1H3"/>',
  rich: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l2 2 4-4" transform="translate(0 1)"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13a9 9 0 1 0 .5-4.5L3 8"/><path d="M12 7v5l4 2"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
};

function icon(name, cls) {
  return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function hydrateIcons(root) {
  ($$('[data-icon]', root)).forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
    node.removeAttribute('data-icon');
  });
}

// ---------- theme ----------
const Theme = {
  get() {
    return localStorage.getItem('oc_theme') ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  },
  set(theme) {
    localStorage.setItem('oc_theme', theme);
    applyTheme(theme);
  },
  toggle() {
    this.set(this.get() === 'dark' ? 'light' : 'dark');
  },
};
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0b1220' : '#2563eb';
  const light = $('#hljs-light'), dark = $('#hljs-dark');
  if (light && dark) {
    if (theme === 'dark') { dark.removeAttribute('disabled'); light.setAttribute('disabled', ''); }
    else { light.removeAttribute('disabled'); dark.setAttribute('disabled', ''); }
  }
  const btn = $('#btn-theme');
  if (btn) btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
}

// ---------- toasts ----------
function toast(message, type = 'info', ms = 3200) {
  const box = $('#toasts');
  const node = el('div', { class: `toast ${type}` }, [
    el('span', { class: 'toast-icon', html: icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'clipboard') }),
    el('span', {}, message),
  ]);
  box.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, ms);
}

// ---------- modals ----------
function openModal(contentNode, { onClose } = {}) {
  const root = $('#modal-root');
  const overlay = el('div', { class: 'modal-overlay' }, [
    el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('button', { class: 'btn icon ghost modal-close', html: icon('x'), 'aria-label': 'Close',
        onclick: () => close() }),
      contentNode,
    ]),
  ]);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    document.body.classList.remove('modal-open');
    if (onClose) onClose();
  }
  document.addEventListener('keydown', escHandler);
  document.body.classList.add('modal-open');
  root.append(overlay);
  hydrateIcons(overlay);
  return { close, overlay };
}

function confirmDialog(message, { danger = true, confirmText = 'Delete' } = {}) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'confirm-body' }, [
      el('h3', {}, 'Are you sure?'),
      el('p', { class: 'muted' }, message),
      el('div', { class: 'row gap end' }, [
        el('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(false); } }, 'Cancel'),
        el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { m.close(); resolve(true); } }, confirmText),
      ]),
    ]);
    const m = openModal(body, { onClose: () => resolve(false) });
  });
}

// ---------- clipboard ----------
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- formatting ----------
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function expiryLabel(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `Expires in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Expires in ${hours}h`;
  return `Expires in ${Math.floor(hours / 24)}d`;
}

const TYPE_META = {
  text: { icon: 'text', label: 'Text' },
  richtext: { icon: 'rich', label: 'Rich text' },
  code: { icon: 'code', label: 'Code' },
};

// ---------- API client ----------
const Auth = {
  get token() { return localStorage.getItem('oc_token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('oc_user') || 'null'); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem('oc_token', token);
    localStorage.setItem('oc_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('oc_token');
    localStorage.removeItem('oc_user');
  },
  get isLoggedIn() { return !!this.token; },
};

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0);
  }
  if (res.status === 401 && Auth.isLoggedIn && !path.startsWith('/api/auth')) {
    Auth.clear();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
  if (raw) return res;
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
