(function () {
  const app = document.getElementById('app');
  const trainerFilter = document.getElementById('trainerFilter');
  const tagFilter = document.getElementById('tagFilter');
  const resetBtn = document.getElementById('resetBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  // Инициализация Telegram WebApp
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // ---------- УТИЛИТЫ ----------
  // Простой парсер CSV с поддержкой кавычек
  function parseCSV(text) {
    const rows = [];
    let cur = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQuotes) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { cur.push(field); field = ''; }
        else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
        else { field += c; }
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  }

  function toObjects(rows) {
    const header = rows[0].map(h => h.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const o = {};
      for (let j = 0; j < header.length; j++) o[header[j]] = (rows[i][j] ?? '').trim();
      out.push(o);
    }
    return out;
  }

  // Нормализация заголовков (поддержка русских названий колонок)
  function normalizeKeys(obj) {
    const map = {
      'дата': 'date', 'day': 'date',
      'время': 'time',
      'название': 'title', 'тема': 'title',
      'тренер': 'trainer',
      'кластер': 'tag', 'тег': 'tag',
      'ссылка': 'link', 'link': 'link'
    };
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = (k || '').trim().toLowerCase();
      const val = (v || '').trim();
      out[map[key] || key] = val;
    }
    return out;
  }

  function groupByDate(items) {
    return items.reduce((acc, it) => {
      const d = it.date || it.Date || it.DATE;
      if (!d) return acc;
      (acc[d] ||= []).push(it);
      return acc;
    }, {});
  }

  function unique(list) {
    return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function applyFilters(items) {
    const t = trainerFilter.value;
    const g = tagFilter.value;
    return items.filter(it => {
      const okTrainer = !t || (it.trainer || '').toLowerCase() === t.toLowerCase();
      const okTag = !g || (it.tag || '').toLowerCase() === g.toLowerCase();
      return okTrainer && okTag;
    });
  }

  // ---------- РЕНДЕР ----------
  function render(items) {
    const filtered = applyFilters(items);
    const grouped = groupByDate(filtered);
    const dates = Object.keys(grouped).sort();

    app.innerHTML = '';
    if (!dates.length) {
      app.textContent = 'Нет подходящих занятий.';
      return;
    }

    dates.forEach(d => {
      const sec = document.createElement('section');
      sec.className = 'day';

      const h = document.createElement('h3');
      h.textContent = d;
      sec.appendChild(h);

      const events = grouped[d].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      events.forEach(it => {
        const card = document.createElement('div');
        card.className = 'card';

        const time = it.time || '';
        const title = it.title || '';
        const trainer = it.trainer || '';
        const tag = it.tag || '';
        const link = it.link || '#';

        card.innerHTML = `
          <div class="title">${time ? (time + ' — ') : ''}${title || 'Без названия'}</div>
          <div class="meta">
            ${trainer ? ('Тренер: ' + trainer) : ''}${trainer && tag ? ' · ' : ''}${tag ? ('Кластер: ' + tag) : ''}
          </div>
          <div class="actions">
            <button class="copy-link" data-link="${link}">Копировать ссылку</button>
            <button class="open-link" data-link="${link}">Открыть в браузере</button>
          </div>
        `;

        sec.appendChild(card);
      });

      app.appendChild(sec);
    });

    if (window.Telegram?.WebApp?.MainButton) {
      Telegram.WebApp.MainButton.setText('Обновить').show().onClick(() => location.reload());
    }
  }

  // ---------- ЗАГРУЗКА ----------
  let rawItems = [];

  function populateFilters(items) {
    const trainers = unique(items.map(i => i.trainer));
    const tags = unique(items.map(i => i.tag));
    trainerFilter.innerHTML = '<option value="">Все тренеры</option>' + trainers.map(v => `<option>${v}</option>`).join('');
    tagFilter.innerHTML = '<option value="">Все кластеры</option>' + tags.map(v => `<option>${v}</option>`).join('');
  }

  function load() {
    app.textContent = 'Загрузка…';
    fetch(window.CSV_URL, { cache: 'no-store' })
      .then(r => r.text())
      .then(text => {
        const rows = parseCSV(text);
        const raw = toObjects(rows).map(normalizeKeys);
        const items = raw.map(o => ({
          date: o.date || '',
          time: o.time || '',
          title: o.title || '',
          trainer: o.trainer || '',
          tag: o.tag || '',
          link: o.link || ''
        }));
        rawItems = items;
        populateFilters(items);
        render(items);
      })
      .catch(err => {
        console.error(err);
        app.textContent = 'Ошибка загрузки расписания.';
      });
  }

  trainerFilter.addEventListener('change', () => render(rawItems));
  tagFilter.addEventListener('change', () => render(rawItems));
  resetBtn.addEventListener('click', () => {
    trainerFilter.value = '';
    tagFilter.value = '';
    render(rawItems);
  });
  refreshBtn.addEventListener('click', () => location.reload());

  load();
})(); // ← закрыли IIFE

// ---------- ОБРАБОТЧИКИ КНОПОК ----------
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-link');
  const openBtn = e.target.closest('.open-link');

  if (copyBtn) {
    const url = copyBtn.dataset.link;
    (navigator.clipboard?.writeText(url) || Promise.reject())
      .then(() => alert('Ссылка скопирована. Откройте её в Яндекс.Браузере или с сертификатом Минцифры.'))
      .catch(() => {
        // Фолбэк для старых веб-вью
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); alert('Ссылка скопирована.'); }
        catch { alert('Не удалось скопировать. Скопируйте вручную: ' + url); }
        document.body.removeChild(ta);
      });
  }

  if (openBtn) {
    const url = openBtn.dataset.link;
    const note = '⚠️ Сайт corpuniver.rt.ru чаще всего открывается только в Яндекс.Браузере или при установленном сертификате Минцифры.\n\nОткрыть сейчас?';
    if (confirm(note)) window.open(url, '_blank', 'noopener,noreferrer');
  }
});

// (Опционально) копирование по долгому тапу на «Открыть в браузере»
let pressTimer;
document.addEventListener('touchstart', (e) => {
  const target = e.target.closest('.open-link');
  if (!target) return;
  const url = target.dataset.link;
  pressTimer = setTimeout(() => {
    navigator.clipboard?.writeText(url);
    alert('Ссылка скопирована. Откройте её в Яндекс.Браузере.');
  }, 550);
}, { passive: true });

document.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
document.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
