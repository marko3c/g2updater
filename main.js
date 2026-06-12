/* G2 Profile Manager — main.js */

const state = {
  schema: null,
  products: [],
  current: null,
  dirty: false
};

// Tracks text nodes that contain [Product] so we can replace on product switch
const placeholderTextNodes = [];

const $ = id => document.getElementById(id);
const productSelect = $('product-select');
const mainForm = $('main-form');
const loadingEl = $('loading');
const saveBtn = $('save-btn');
const saveProductName = $('save-product-name');
const dirtyDot = $('dirty-indicator');
const toastEl = $('toast');

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [products, schema] = await Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/fields').then(r => r.json())
    ]);
    state.products = products;
    state.schema = schema;

    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.slug;
      opt.textContent = p.displayName;
      productSelect.appendChild(opt);
    });

    buildForm(schema);

    if (products.length) await loadProduct(products[0].slug);

    loadingEl.style.display = 'none';
    mainForm.style.display = '';
  } catch (err) {
    loadingEl.textContent = 'Failed to load: ' + err.message;
    console.error(err);
  }
}

// ── Product switching ──────────────────────────────────────────────────────

productSelect.addEventListener('change', async () => {
  if (state.dirty && !confirm('You have unsaved changes. Switch product anyway?')) {
    productSelect.value = state.current.meta.slug;
    return;
  }
  await loadProduct(productSelect.value);
});

async function loadProduct(slug) {
  const product = await fetch(`/api/product/${slug}`).then(r => r.json());
  state.current = product;
  bindData(product);
  setDirty(false);
  saveProductName.textContent = product.meta.displayName;
  productSelect.value = slug;
}

// ── Dirty state ────────────────────────────────────────────────────────────

function setDirty(val) {
  state.dirty = val;
  dirtyDot.classList.toggle('dirty', val);
}

// ── Save ───────────────────────────────────────────────────────────────────

$('download-btn').addEventListener('click', () => {
  if (!state.current) return;
  const payload = { meta: state.current.meta, data: serializeForm() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `product-${state.current.meta.slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

saveBtn.addEventListener('click', async () => {
  if (!validateForm()) return;
  const payload = { meta: state.current.meta, data: serializeForm() };
  try {
    const res = await fetch(`/api/product/${state.current.meta.slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.current = payload;
    setDirty(false);
    showToast('Saved successfully', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
});

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, type) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className = 'show' + (type ? ' ' + type : '');
  toastTimer = setTimeout(() => { toastEl.className = ''; }, 3000);
}

// ── Form Building ──────────────────────────────────────────────────────────

function buildForm(schema) {
  mainForm.innerHTML = '';
  placeholderTextNodes.length = 0;

  schema.sections.forEach(section => {
    if (section.id === 'features') {
      buildFeaturesSection(section);
    } else {
      section.subsections.forEach(sub => {
        const heading = mkEl('h2', { className: 'section-heading' });
        const tn = document.createTextNode(`${section.label} > ${sub.label}`);
        if (sub.label.includes('[Product]')) placeholderTextNodes.push({ node: tn, template: `${section.label} > ${sub.label}` });
        heading.appendChild(tn);

        const card = mkEl('div', { className: 'form-card' });
        sub.fields.forEach(f => card.appendChild(buildFieldRow(f)));
        mainForm.append(heading, card);
      });
    }
  });

  // Single delegated listener for dirty tracking
  mainForm.addEventListener('change', () => setDirty(true));
  mainForm.addEventListener('input', () => setDirty(true));
}

function buildFeaturesSection(section) {
  const heading = mkEl('h2', { className: 'section-heading' }, 'Features');
  mainForm.appendChild(heading);

  section.featureCategories.forEach(cat => {
    const wrap = mkEl('div', { className: 'feature-section form-card' });
    wrap.dataset.catId = cat.id;

    const hdr = mkEl('div', { className: 'feature-section-header' });
    const title = mkEl('span', { className: 'feature-section-title' }, cat.label);
    const inactive = mkEl('span', { className: 'feature-inactive-label' });
    const toggle = mkEl('span', { className: 'feature-section-toggle' }, '▾');
    hdr.append(title, inactive, toggle);

    hdr.addEventListener('click', () => {
      const body = wrap.querySelector('.feature-section-body');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      toggle.textContent = collapsed ? '▾' : '▸';
    });

    const body = mkEl('div', { className: 'feature-section-body' });

    cat.subsections.forEach(sub => {
      body.appendChild(mkEl('div', { className: 'feature-subsection-label' }, sub.label));

      const table = mkEl('table', { className: 'feature-table' });
      table.innerHTML = '<thead><tr>' +
        '<th class="feat-name">Feature</th><th class="feat-desc">Description</th>' +
        '<th>Native</th><th>Custom Code</th><th>Third Party</th><th>Not Available</th>' +
        '</tr></thead>';
      const tbody = mkEl('tbody');

      sub.features.forEach(feat => {
        const tr = mkEl('tr');
        tr.appendChild(mkEl('td', { className: 'feat-name' }, feat.label));
        tr.appendChild(mkEl('td', { className: 'feat-desc' }, feat.description));
        ['Native', 'Custom Code', 'Third Party', 'Not Available'].forEach(opt => {
          const td = mkEl('td');
          const inp = mkEl('input', { type: 'radio' });
          inp.name = `feat_${cat.id}_${feat.id}`;
          inp.value = opt;
          inp.dataset.catId = cat.id;
          inp.dataset.featId = feat.id;
          td.appendChild(inp);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      body.appendChild(table);
    });

    wrap.append(hdr, body);
    mainForm.appendChild(wrap);
  });
}

function buildFieldRow(field) {
  const row = mkEl('div', { className: 'field-row' });
  row.dataset.fieldId = field.id;

  // Label
  const label = mkEl('label', { className: 'field-label' });
  const labelText = document.createTextNode(field.label);
  if (field.label.includes('[Product]')) placeholderTextNodes.push({ node: labelText, template: field.label });
  label.appendChild(labelText);
  if (field.required) label.appendChild(mkEl('span', { className: 'required-star' }, ' *'));
  if (field.tooltip) label.appendChild(buildTooltip(field.tooltip));
  row.appendChild(label);

  // Input
  const input = buildInput(field);
  if (input) row.appendChild(input);

  // Word count
  if (field.type === 'textarea' && (field.minWords || field.maxWords)) {
    row.appendChild(mkEl('div', { className: 'word-count', id: `wc_${field.id}` }, '0 words'));
  }

  // Validation error
  row.appendChild(mkEl('div', { className: 'field-error', id: `err_${field.id}` }));
  return row;
}

function buildInput(field) {
  switch (field.type) {
    case 'text':
      return mkEl('input', { type: 'text', id: field.id, name: field.id });

    case 'url':
      return mkEl('input', { type: 'url', id: field.id, name: field.id });

    case 'year':
      return Object.assign(mkEl('input', { type: 'number', id: field.id, name: field.id }), { min: 1900, max: 2099, placeholder: 'YYYY' });

    case 'textarea': {
      const ta = mkEl('textarea', { id: field.id, name: field.id, rows: 6 });
      if (field.minWords || field.maxWords) ta.addEventListener('input', () => updateWordCount(field));
      return ta;
    }

    case 'radio': {
      const wrap = mkEl('div', { className: 'radio-group' });
      wrap.id = `rg_${field.id}`;
      field.options.forEach(opt => {
        const lbl = mkEl('label');
        const inp = mkEl('input', { type: 'radio', name: field.id, value: opt });
        lbl.append(inp, document.createTextNode(' ' + opt));
        wrap.appendChild(lbl);
      });
      return wrap;
    }

    case 'checkbox-group': {
      const wrap = mkEl('div', { className: 'checkbox-group' });
      wrap.id = `cg_${field.id}`;
      field.options.forEach(opt => {
        const lbl = mkEl('label');
        const inp = mkEl('input', { type: 'checkbox', name: field.id, value: opt });
        lbl.append(inp, document.createTextNode(' ' + opt));
        wrap.appendChild(lbl);
      });
      return wrap;
    }

    case 'tag-select':
      return buildTagSelect(field);

    case 'file': {
      const wrap = mkEl('div', { className: 'file-field-wrap' });
      const fileInp = mkEl('input', { type: 'file', id: field.id, accept: field.accept || '' });
      const metaParts = [];
      if (field.accept) metaParts.push(`Accepted: ${field.accept}`);
      if (field.maxSizeMB) metaParts.push(`Max ${field.maxSizeMB}MB`);
      if (field.minDimension) metaParts.push(`Min ${field.minDimension}`);
      const metaSpan = mkEl('span', { className: 'file-field-meta' }, metaParts.join(' · '));
      const currentSpan = mkEl('span', { className: 'file-current', id: `file_current_${field.id}` });
      const hidden = mkEl('input', { type: 'hidden', id: `file_val_${field.id}`, name: `file_val_${field.id}` });
      fileInp.addEventListener('change', () => {
        if (fileInp.files[0]) {
          hidden.value = fileInp.files[0].name;
          currentSpan.textContent = fileInp.files[0].name;
          setDirty(true);
        }
      });
      wrap.append(fileInp, metaSpan, currentSpan, hidden);
      return wrap;
    }

    case 'utm': {
      const wrap = mkEl('div', { className: 'utm-group' });
      field.fields.forEach(sub => {
        const div = mkEl('div', { className: 'utm-field' });
        const lbl = mkEl('label', {}, sub.label);
        const inp = mkEl('input', { type: 'text', id: sub.id, name: sub.id, placeholder: sub.placeholder || '' });
        div.append(lbl, inp);
        wrap.appendChild(div);
      });
      return wrap;
    }

    case 'pricing-package': {
      const wrap = mkEl('div');
      wrap.id = `pkg_wrap_${field.id}`;
      const list = mkEl('div', { className: 'pricing-package-list', id: `pkg_list_${field.id}` });
      const addBtn = mkEl('button', { type: 'button', className: 'btn-add-package' }, '+ Add Pricing Package');
      addBtn.addEventListener('click', () => addPackage(field.id));
      wrap.append(list, addBtn);
      return wrap;
    }

    default:
      return null;
  }
}

function buildTooltip(text) {
  const icon = mkEl('span', { className: 'tooltip-icon' }, 'ⓘ');
  const bubble = mkEl('span', { className: 'tooltip-bubble' }, text);
  icon.appendChild(bubble);
  icon.addEventListener('click', e => {
    e.stopPropagation();
    icon.classList.toggle('open');
  });
  document.addEventListener('click', () => icon.classList.remove('open'), { passive: true });
  return icon;
}

// ── Tag Select ─────────────────────────────────────────────────────────────

function buildTagSelect(field) {
  const container = mkEl('div', { className: 'tag-select-wrap' });
  container.dataset.fieldId = field.id;
  container.style.position = 'relative';

  const tagList = mkEl('div', { className: 'tag-list' });
  const input = mkEl('input', { type: 'text', className: 'tag-input', placeholder: 'Type to add…' });
  const sugBox = mkEl('div', { className: 'tag-suggestions' });
  sugBox.style.display = 'none';

  let values = [];

  function renderTags() {
    tagList.innerHTML = '';
    values.forEach((v, i) => {
      const tag = mkEl('span', { className: 'tag' });
      tag.appendChild(document.createTextNode(v));
      const rm = mkEl('span', { className: 'tag-remove', title: 'Remove' }, '×');
      rm.addEventListener('click', () => { values.splice(i, 1); renderTags(); setDirty(true); });
      tag.appendChild(rm);
      tagList.appendChild(tag);
    });
  }

  function addValue(v) {
    v = v.trim();
    if (!v || values.includes(v)) return;
    values.push(v);
    renderTags();
    input.value = '';
    sugBox.style.display = 'none';
    setDirty(true);
  }

  function showSuggestions(q) {
    sugBox.innerHTML = '';
    if (!q) { sugBox.style.display = 'none'; return; }
    const matches = (field.suggestions || []).filter(s =>
      s.toLowerCase().includes(q.toLowerCase()) && !values.includes(s)
    ).slice(0, 8);
    if (!matches.length) { sugBox.style.display = 'none'; return; }
    matches.forEach(s => {
      const item = mkEl('div', { className: 'tag-suggestion-item' }, s);
      item.addEventListener('mousedown', e => { e.preventDefault(); addValue(s); });
      sugBox.appendChild(item);
    });
    sugBox.style.display = 'block';
  }

  input.addEventListener('input', () => showSuggestions(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addValue(input.value); }
    if (e.key === 'Backspace' && !input.value && values.length) { values.pop(); renderTags(); setDirty(true); }
  });
  input.addEventListener('blur', () => setTimeout(() => { sugBox.style.display = 'none'; }, 150));

  container._getValues = () => [...values];
  container._setValues = v => { values = Array.isArray(v) ? [...v] : []; renderTags(); };

  container.append(tagList, input, sugBox);
  return container;
}

// ── Pricing Packages ───────────────────────────────────────────────────────

let pkgCounter = 0;

function addPackage(fieldId, data) {
  data = data || {};
  const list = $(`pkg_list_${fieldId}`);
  const id = ++pkgCounter;

  const item = mkEl('div', { className: 'pricing-package-item' });
  item.dataset.pkgId = id;

  const hdr = mkEl('div', { className: 'pricing-package-header' });
  const num = mkEl('strong', {}, `Package ${list.children.length + 1}`);
  const rmBtn = mkEl('button', { type: 'button', className: 'btn-remove-package' }, 'Remove');
  rmBtn.addEventListener('click', () => { item.remove(); renumberPackages(fieldId); setDirty(true); });
  hdr.append(num, rmBtn);
  item.appendChild(hdr);

  [
    { key: 'edition', label: 'Edition Name', placeholder: 'e.g. Basic, Enterprise' },
    { key: 'price', label: 'Price', placeholder: 'e.g. $20,000/year or Contact us' },
    { key: 'description', label: 'Features / Description', placeholder: 'List features included in this tier', textarea: true }
  ].forEach(f => {
    const row = mkEl('div', { className: 'field-row' });
    const lbl = mkEl('label', { className: 'pkg-label' }, f.label);
    let inp;
    if (f.textarea) {
      inp = mkEl('textarea', { id: `pkg_${id}_${f.key}`, name: `pkg_${id}_${f.key}`, rows: 3 });
      inp.style.width = '100%';
    } else {
      inp = mkEl('input', { type: 'text', id: `pkg_${id}_${f.key}`, name: `pkg_${id}_${f.key}`, placeholder: f.placeholder });
    }
    inp.value = data[f.key] || '';
    row.append(lbl, inp);
    item.appendChild(row);
  });

  list.appendChild(item);
}

function renumberPackages(fieldId) {
  Array.from($(`pkg_list_${fieldId}`).children).forEach((item, i) => {
    item.querySelector('strong').textContent = `Package ${i + 1}`;
  });
}

function getPackages(fieldId) {
  return Array.from($(`pkg_list_${fieldId}`).children).map(item => {
    const id = item.dataset.pkgId;
    return {
      edition: ($(`pkg_${id}_edition`) || {}).value || '',
      price: ($(`pkg_${id}_price`) || {}).value || '',
      description: ($(`pkg_${id}_description`) || {}).value || ''
    };
  });
}

function clearPackages(fieldId) {
  $(`pkg_list_${fieldId}`).innerHTML = '';
  pkgCounter = 0;
}

// ── Data Binding ───────────────────────────────────────────────────────────

function bindData(product) {
  const { meta, data } = product;
  const activeCats = meta.activeFeatureCategories || [];

  replacePlaceholders(meta.productPlaceholder || meta.displayName);

  // Regular sections
  state.schema.sections.forEach(section => {
    if (section.id === 'features') return;
    section.subsections.forEach(sub => sub.fields.forEach(f => bindField(f, data)));
  });

  // Feature sections
  const featSection = state.schema.sections.find(s => s.id === 'features');
  if (!featSection) return;

  featSection.featureCategories.forEach(cat => {
    const wrap = mainForm.querySelector(`.feature-section[data-cat-id="${cat.id}"]`);
    if (!wrap) return;
    const active = activeCats.includes(cat.id);
    const body = wrap.querySelector('.feature-section-body');
    const inactiveLbl = wrap.querySelector('.feature-inactive-label');
    const toggle = wrap.querySelector('.feature-section-toggle');

    wrap.classList.toggle('disabled', !active);
    body.style.display = active ? '' : 'none';
    toggle.textContent = active ? '▾' : '▸';
    inactiveLbl.textContent = active ? '' : 'Not applicable — category not assigned on G2';
    wrap.querySelectorAll('input[type="radio"]').forEach(r => { r.disabled = !active; });

    const catData = (data.features || {})[cat.id] || {};
    cat.subsections.forEach(sub => {
      sub.features.forEach(feat => {
        const val = catData[feat.id] || '';
        mainForm.querySelectorAll(`input[name="feat_${cat.id}_${feat.id}"]`).forEach(r => {
          r.checked = r.value === val;
        });
      });
    });
  });
}

function bindField(field, data) {
  if (field.type === 'utm') {
    field.fields.forEach(sub => {
      const inp = $(sub.id);
      if (inp) inp.value = data[sub.id] || '';
    });
    return;
  }
  if (field.type === 'pricing-package') {
    clearPackages(field.id);
    (data[field.id] || []).forEach(pkg => addPackage(field.id, pkg));
    return;
  }
  if (field.type === 'tag-select') {
    const wrap = mainForm.querySelector(`.tag-select-wrap[data-field-id="${field.id}"]`);
    if (wrap) wrap._setValues(data[field.id] || []);
    return;
  }
  if (field.type === 'checkbox-group') {
    const sel = data[field.id] || [];
    mainForm.querySelectorAll(`input[name="${field.id}"]`).forEach(cb => { cb.checked = sel.includes(cb.value); });
    return;
  }
  if (field.type === 'radio') {
    const val = data[field.id] || '';
    mainForm.querySelectorAll(`input[name="${field.id}"]`).forEach(r => { r.checked = r.value === val; });
    return;
  }
  if (field.type === 'file') {
    const hidden = $(`file_val_${field.id}`);
    const current = $(`file_current_${field.id}`);
    if (hidden) hidden.value = data[field.id] || '';
    if (current) current.textContent = data[field.id] ? `Current: ${data[field.id]}` : '';
    return;
  }
  const inp = $(field.id);
  if (inp) {
    inp.value = data[field.id] || '';
    if (field.type === 'textarea' && (field.minWords || field.maxWords)) updateWordCount(field);
  }
}

// ── Placeholder Replacement ────────────────────────────────────────────────

function replacePlaceholders(productName) {
  placeholderTextNodes.forEach(({ node, template }) => {
    node.textContent = template.replace(/\[Product\]/g, productName);
  });
}

// ── Word Count ─────────────────────────────────────────────────────────────

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function updateWordCount(field) {
  const ta = $(field.id);
  const wc = $(`wc_${field.id}`);
  if (!ta || !wc) return;
  const count = countWords(ta.value);
  const parts = [`${count} word${count !== 1 ? 's' : ''}`];
  if (field.minWords) parts.push(`min ${field.minWords}`);
  if (field.maxWords) parts.push(`max ${field.maxWords}`);
  wc.textContent = parts.join(' · ');
  wc.className = 'word-count' +
    (field.minWords && count > 0 && count < field.minWords ? ' under' : '') +
    (field.maxWords && count > field.maxWords ? ' over' : '');
}

// ── Serialization ──────────────────────────────────────────────────────────

function serializeForm() {
  const data = {};

  state.schema.sections.forEach(section => {
    if (section.id === 'features') return;
    section.subsections.forEach(sub => {
      sub.fields.forEach(field => {
        if (field.type === 'utm') {
          field.fields.forEach(sub => {
            const inp = $(sub.id);
            data[sub.id] = inp ? inp.value : '';
          });
        } else if (field.type === 'pricing-package') {
          data[field.id] = getPackages(field.id);
        } else if (field.type === 'tag-select') {
          const wrap = mainForm.querySelector(`.tag-select-wrap[data-field-id="${field.id}"]`);
          data[field.id] = wrap ? wrap._getValues() : [];
        } else if (field.type === 'checkbox-group') {
          data[field.id] = Array.from(mainForm.querySelectorAll(`input[name="${field.id}"]:checked`)).map(c => c.value);
        } else if (field.type === 'radio') {
          const checked = mainForm.querySelector(`input[name="${field.id}"]:checked`);
          data[field.id] = checked ? checked.value : '';
        } else if (field.type === 'file') {
          const hidden = $(`file_val_${field.id}`);
          data[field.id] = hidden ? hidden.value : '';
        } else {
          const inp = $(field.id);
          data[field.id] = inp ? inp.value : '';
        }
      });
    });
  });

  data.features = {};
  const featSection = state.schema.sections.find(s => s.id === 'features');
  if (featSection) {
    featSection.featureCategories.forEach(cat => {
      data.features[cat.id] = {};
      cat.subsections.forEach(sub => {
        sub.features.forEach(feat => {
          const checked = mainForm.querySelector(`input[name="feat_${cat.id}_${feat.id}"]:checked`);
          data.features[cat.id][feat.id] = checked ? checked.value : '';
        });
      });
    });
  }

  return data;
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateForm() {
  let valid = true;
  mainForm.querySelectorAll('.field-error').forEach(e => { e.textContent = ''; });
  mainForm.querySelectorAll('.error').forEach(e => e.classList.remove('error'));

  state.schema.sections.forEach(section => {
    if (section.id === 'features') return;
    section.subsections.forEach(sub => {
      sub.fields.forEach(field => {
        const err = $(`err_${field.id}`);
        if (!err) return;

        if (field.required) {
          let empty = false;
          if (field.type === 'tag-select') {
            const wrap = mainForm.querySelector(`.tag-select-wrap[data-field-id="${field.id}"]`);
            empty = !wrap || !wrap._getValues().length;
          } else if (field.type === 'file') {
            const hidden = $(`file_val_${field.id}`);
            empty = !hidden || !hidden.value;
          } else {
            const inp = $(field.id);
            empty = !inp || !inp.value.trim();
          }
          if (empty) {
            err.textContent = 'This field is required.';
            const inp = $(field.id);
            if (inp) inp.classList.add('error');
            valid = false;
          }
        }

        if (field.type === 'textarea' && (field.minWords || field.maxWords)) {
          const ta = $(field.id);
          if (ta && ta.value.trim()) {
            const count = countWords(ta.value);
            if (field.minWords && count < field.minWords) {
              err.textContent = `Minimum ${field.minWords} words required (currently ${count}).`;
              ta.classList.add('error');
              valid = false;
            } else if (field.maxWords && count > field.maxWords) {
              err.textContent = `Maximum ${field.maxWords} words allowed (currently ${count}).`;
              ta.classList.add('error');
              valid = false;
            }
          }
        }
      });
    });
  });

  if (!valid) showToast('Please fix the highlighted errors.', 'error');
  return valid;
}

// ── DOM helper ─────────────────────────────────────────────────────────────

function mkEl(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') e.className = v;
    else if (k === 'type' || k === 'id' || k === 'name' || k === 'placeholder' || k === 'accept' || k === 'rows' || k === 'min' || k === 'max') e[k] = v;
    else e.setAttribute(k, v);
  });
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Boot ───────────────────────────────────────────────────────────────────

init();
