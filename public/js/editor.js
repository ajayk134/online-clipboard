// public/js/editor.js — clip editor modal (text / rich text / code), share + QR
/* global Quill, escapeHtml, el, $, $$, openModal, toast, icon, hydrateIcons, copyToClipboard, api, Auth, TYPE_META */
'use strict';

const EXPiry_PRESETS = [
  ['never', 'Never expires'],
  ['10m', '10 minutes'],
  ['1h', '1 hour'],
  ['8h', '8 hours'],
  ['24h', '1 day'],
  ['3d', '3 days'],
  ['7d', '1 week'],
  ['30d', '30 days'],
  ['custom', 'Custom…'],
];

function expiryToIso(preset, customValue) {
  const ms = { '10m': 6e5, '1h': 36e5, '8h': 288e5, '24h': 864e5, '3d': 2592e5, '7d': 6048e5, '30d': 2592e6 };
  if (!preset || preset === 'never') return null;
  if (preset === 'custom') {
    if (!customValue) return null;
    return new Date(customValue).toISOString();
  }
  return new Date(Date.now() + (ms[preset] || 0)).toISOString();
}

function isoToPreset(iso) {
  if (!iso) return 'never';
  const ms = new Date(iso).getTime() - Date.now();
  const round = { 6e5: '10m', 36e5: '1h', 288e5: '8h', 864e5: '24h', 2592e5: '3d', 6048e5: '7d', 2592e6: '30d' };
  for (const [k, v] of Object.entries(round)) if (Math.abs(ms - k) < 12e4) return v;
  return 'custom';
}

function tagsToString(tags) {
  return (tags || []).join(', ');
}

function parseTagsInput(value) {
  return value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Clip editor modal
// ---------------------------------------------------------------------------
function openClipEditor({ clip = null, onSaved } = {}) {
  const isEdit = !!clip;
  let quill = null;
  let activeTab = clip ? clip.contentType : 'text';
  let currentTags = clip ? [...(clip.tags || [])] : [];

  const body = el('div', { class: 'editor-body' });
  const modal = openModal(body, {
    onClose: () => { if (quill) try { quilloff(); } catch { /* noop */ } },
  });
  function quilloff() { quill = null; }

  body.innerHTML = `
    <div class="editor-head">
      <h2>${isEdit ? 'Edit clip' : 'New clip'}</h2>
      <div class="seg" id="ed-tabs">
        <button class="seg-btn" data-tab="text">${icon('text')} Text</button>
        <button class="seg-btn" data-tab="richtext">${icon('rich')} Rich text</button>
        <button class="seg-btn" data-tab="code">${icon('code')} Code</button>
      </div>
    </div>

    <input id="ed-title" class="input title-input" placeholder="Title (optional)" maxlength="200"
           value="${clip ? escapeHtml(clip.title || '') : ''}">

    <div class="editor-panes">
      <div class="ed-pane" data-pane="text"><textarea id="ed-text" class="input area" placeholder="Paste or type text…"></textarea></div>
      <div class="ed-pane" data-pane="richtext"><div id="ed-quill"></div></div>
      <div class="ed-pane" data-pane="code">
        <div class="code-head">
          <select id="ed-lang" class="input select small">
            <option value="">Language…</option>
            ${['javascript','typescript','python','java','c','cpp','csharp','go','rust','php','ruby','sql','json','yaml','xml','html','css','bash','shell','dockerfile','markdown','plaintext'].map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
        <textarea id="ed-code" class="input area mono" placeholder="Paste code…" spellcheck="false"></textarea>
      </div>
    </div>

    <div class="editor-meta">
      <div class="field grow">
        <span>Tags <span class="muted small">(comma separated)</span></span>
        <input id="ed-tags" class="input" placeholder="work, snippet, todo" value="${escapeHtml(tagsToString(currentTags))}">
        <div id="ed-tag-chips" class="tag-cloud"></div>
      </div>
      <div class="field">
        <span>Expires</span>
        <select id="ed-expiry" class="input select">
          ${EXPiry_PRESETS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <input type="datetime-local" id="ed-expiry-custom" class="input hidden">
      </div>
    </div>

    <details class="share-details" id="ed-share-details" ${clip && clip.shareEnabled ? 'open' : ''}>
      <summary>${icon('share')} Share & link options</summary>
      <div class="share-grid">
        <label class="switch-row">
          <input type="checkbox" id="ed-share-enable" ${clip && clip.shareEnabled ? 'checked' : ''}>
          <span class="switch"></span>
          <span>Enable secure share link</span>
        </label>
        <label class="switch-row">
          <input type="checkbox" id="ed-share-onetime">
          <span class="switch"></span>
          <span>One-time link (burn after first view)</span>
        </label>
        <label class="field">
          <span>Share password <span class="muted small">(optional${clip && clip.hasPassword ? ', set' : ''})</span></span>
          <input type="password" id="ed-share-password" placeholder="${clip && clip.hasPassword ? '•••••••• (unchanged)' : 'Leave empty for no password'}" autocomplete="new-password">
        </label>
        <div id="ed-share-result" class="share-result hidden"></div>
      </div>
    </details>

    <p class="form-error hidden" id="ed-error"></p>
    <div class="row gap end editor-actions">
      ${isEdit ? `<button class="btn danger" id="ed-delete">${icon('trash')} Delete</button>` : ''}
      <button class="btn ghost" id="ed-cancel">Cancel</button>
      <button class="btn primary" id="ed-save">${icon('check')} ${isEdit ? 'Save changes' : 'Save clip'}</button>
    </div>
  `;

  hydrateIcons(body);

  const $text = $('#ed-text', body);
  const $code = $('#ed-code', body);
  const $tabs = $$('#ed-tabs .seg-btn', body);
  const $panes = $$('.ed-pane', body);
  const $expiry = $('#ed-expiry', body);
  const $expiryCustom = $('#ed-expiry-custom', body);
  const $shareEnable = $('#ed-share-enable', body);
  const $shareOneTime = $('#ed-share-onetime', body);
  const $sharePassword = $('#ed-share-password', body);
  const $shareResult = $('#ed-share-result', body);

  // initial content
  if (clip) {
    if (clip.contentType === 'richtext') { $text.value = stripTags(clip.content); }
    else $text.value = clip.contentType === 'code' ? '' : clip.content;
    $code.value = clip.contentType === 'code' ? clip.content : '';
    $('#ed-lang', body).value = clip.language || '';
    if (clip.expiresAt) {
      $expiry.value = isoToPreset(clip.expiresAt);
      if ($expiry.value === 'custom') {
        $expiryCustom.classList.remove('hidden');
        $expiryCustom.value = new Date(clip.expiresAt).toISOString().slice(0, 16);
      }
    }
    if (clip.shareEnabled) {
      $shareOneTime.checked = !!clip.isOneTime;
      showShareResult(clip.shareUrl || (location.origin + '/s/…'), clip.hasPassword, clip.isOneTime, !!(clip.shareUrl));
    }
  }

  function stripTags(html) {
    const d = el('div', {}); d.innerHTML = html; return d.textContent || '';
  }

  function ensureQuill() {
    if (quill || typeof Quill === 'undefined') return quill;
    quill = new Quill($('#ed-quill', body), {
      theme: 'snow',
      placeholder: 'Write rich content…',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean'],
        ],
      },
    });
    if (clip && clip.contentType === 'richtext') quill.root.innerHTML = clip.content;
    return quill;
  }

  function setTab(tab) {
    activeTab = tab;
    $tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
    if (tab === 'richtext') {
      ensureQuill();
      if (quill && !$text.value.trim() && quill.getText().trim() === '' && ($text.value || $code.value)) {
        quill.pasteHTML($text.value || `<pre>${escapeHtml($code.value)}</pre>`);
      }
    }
    if (tab === 'code' && !$code.value && $text.value && !$text.value.includes('\n\n')) {
      $code.value = $text.value; $text.value = '';
    }
  }
  $tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  setTab(activeTab);

  $expiry.addEventListener('change', () => {
    $expiryCustom.classList.toggle('hidden', $expiry.value !== 'custom');
    if ($expiry.value === 'custom') {
      const d = new Date(Date.now() + 864e5);
      $expiryCustom.value = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    }
  });

  const $tags = $('#ed-tags', body);
  const $chips = $('#ed-tag-chips', body);
  function renderChips() {
    $chips.replaceChildren(...currentTags.map((t) =>
      el('button', { class: 'chip removable', type: 'button', onclick: () => { currentTags = currentTags.filter((x) => x !== t); renderChips(); syncTagInput(); } }, [t, ' ×'])
    ));
  }
  function syncTagInput() { $tags.value = tagsToString(currentTags); }
  $tags.addEventListener('input', () => { currentTags = parseTagsInput($tags.value); renderChips(); });
  renderChips();

  function showShareResult(url, hasPassword, oneTime, ready) {
    $shareResult.classList.remove('hidden');
    $shareResult.innerHTML = `
      ${ready ? `
        <div class="share-link-row">
          <input class="input" readonly value="${escapeHtml(url)}">
          <button class="btn icon" data-copy-link title="Copy link">${icon('copy')}</button>
          <button class="btn icon" data-show-qr title="Show QR">${icon('qr')}</button>
        </div>` : '<p class="muted small">Save the clip to generate the link.</p>'}
      <div class="muted small">
        ${hasPassword ? `${icon('lock')} Password protected. ` : ''}
        ${oneTime ? `${icon('clock')} One-time: link dies after first view.` : ''}
      </div>
    `;
    hydrateIcons($shareResult);
    const copyBtn = $('[data-copy-link]', $shareResult);
    const qrBtn = $('[data-show-qr]', $shareResult);
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      await copyToClipboard(url); toast('Share link copied', 'success');
    });
    if (qrBtn && modal.clipId) qrBtn.addEventListener('click', () => openQrModal(modal.clipId, url));
  }

  $shareEnable.addEventListener('change', () => {
    if ($shareEnable.checked) { $('#ed-share-details', body).open = true; }
  });

  // delete flow
  const $delete = $('#ed-delete', body);
  if ($delete) {
    $delete.addEventListener('click', async () => {
      if (!clip) return;
      const yes = await confirmDialog('Delete this clip permanently? This cannot be undone.');
      if (!yes) return;
      try {
        await api(`/api/clips/${clip.id}`, { method: 'DELETE' });
        toast('Clip deleted', 'success');
        modal.close();
        if (onSaved) onSaved({ deleted: true });
      } catch (err) { showError(err.message); }
    });
  }

  function showError(msg) {
    const $err = $('#ed-error', body);
    $err.textContent = msg;
    $err.classList.remove('hidden');
  }

  $('#ed-cancel', body).addEventListener('click', () => modal.close());

  $('#ed-save', body).addEventListener('click', async () => {
    const $save = $('#ed-save', body);
    $save.disabled = true;
    try {
      const content =
        activeTab === 'richtext' ? (quill ? quill.root.innerHTML : '') :
        activeTab === 'code' ? $code.value : $text.value;

      if (!content || !content.trim() || (activeTab === 'richtext' && quill && quill.getText().trim() === '' && !quill.root.querySelector('img'))) {
        throw new Error('Content is empty');
      }

      const payload = {
        title: $('#ed-title', body).value.trim() || null,
        content,
        contentType: activeTab,
        language: activeTab === 'code' ? ($('#ed-lang', body).value || null) : null,
        tags: currentTags,
        expiresAt: expiryToIso($expiry.value, $expiryCustom.value),
        isPinned: clip ? !!clip.isPinned : false,
        isFavorite: clip ? !!clip.isFavorite : false,
      };

      let saved;
      if (isEdit) {
        saved = await api(`/api/clips/${clip.id}`, { method: 'PATCH', body: payload });
      } else {
        saved = await api('/api/clips', { method: 'POST', body: payload });
      }

      // share settings
      if ($shareEnable.checked) {
        const shareBody = { enabled: true, oneTime: $shareOneTime.checked };
        if ($sharePassword.value) shareBody.password = $sharePassword.value;
        saved = await api(`/api/clips/${saved.id}/share`, { method: 'POST', body: shareBody });
        showShareResult(saved.shareUrl, !!saved.hasPassword, $shareOneTime.checked, true);
        modal.clipId = saved.id;
        if (isEdit) { toast('Clip updated & link ready', 'success'); if (onSaved) onSaved({ clip: saved }); return; }
        // For new clips: keep modal open showing the link? Better: close and toast.
      } else if (isEdit && clip.shareEnabled) {
        await api(`/api/clips/${clip.id}/share`, { method: 'POST', body: { enabled: false } });
      }

      toast(isEdit ? 'Clip updated' : 'Clip saved', 'success');
      modal.close();
      if (onSaved) onSaved({ clip: saved });
    } catch (err) {
      showError(err.message || 'Failed to save');
    } finally {
      $save.disabled = false;
    }
  });

  return modal;
}

// ---------------------------------------------------------------------------
// QR modal
// ---------------------------------------------------------------------------
async function openQrModal(clipId, shareUrl) {
  const body = el('div', { class: 'qr-body' }, [
    el('h3', {}, 'Share via QR code'),
    el('img', { class: 'qr-img', alt: 'QR code', src: `/api/clips/${clipId}/qr` }),
    el('div', { class: 'share-link-row' }, [
      el('input', { class: 'input', readonly: true, value: shareUrl }),
      el('button', { class: 'btn icon', html: icon('copy'), onclick: async (e) => {
        await copyToClipboard(shareUrl); toast('Link copied', 'success');
      } }),
    ]),
  ]);
  openModal(body);
}
