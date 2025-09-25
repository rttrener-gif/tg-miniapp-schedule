(function () {
  const app = document.getElementById('app');
  const trainerFilter = document.getElementById('trainerFilter');
  const tagFilter = document.getElementById('tagFilter');
  const resetBtn = document.getElementById('resetBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const dateAllBtn = document.getElementById('dateAllBtn');
  const todayBtn = document.getElementById('todayBtn');
  const tomorrowBtn = document.getElementById('tomorrowBtn');

let dateFilter = 'all'; // 'all' | 'today' | 'tomorrow'
  
  // Модалка
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = modal.querySelector('.modal-meta');
  const modalBtnOpen = modal.querySelector('.open-link');
  const modalBtnCopy = modal.querySelector('.copy-link');
  const modalBtnEnroll = modal.querySelector('.enroll');
  const modalBtnUnenroll = modal.querySelector('.unenroll');
  const modalClose = modal.querySelector('.close');

  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // ---------- УТИЛИТЫ ----------
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

  function normalizeKeys(obj) {
    const map = {
      'дата': 'date', 'day': 'date',
      'время': 'time',
      'название': 'title', 'тема': 'title',
      'тренер': 'trainer',
      'территория': 'tag', 'территория': 'tag',
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

  // Дет-ид события (стабильный)
  function makeId(it) {
    return `${(it.date||'').trim()}_${(it.time||'').trim()}_${(it.title||'').trim()}`.toLowerCase();
  }
function pad2(n) { return String(n).padStart(2, '0'); }

function getTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
}
function getTomorrowISO() {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`;
}
function nowHM() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** true, если событие уже в прошлом (дата раньше сегодня, или сегодня но время прошло) */
function isPast(item) {
  const d = (item.date || '').trim();     // 'YYYY-MM-DD'
  const t = (item.time || '').trim();     // 'HH:MM' или ''
  const today = getTodayISO();
  if (!d) return false; // нет даты — не фильтруем
  if (d < today) return true;
  if (d === today && t && t < nowHM()) return true;
  return false;
}

/** true, если событие проходит под выбранный фильтр даты */
function matchDateFilter(item) {
  if (dateFilter === 'all') return true;
  const d = (item.date || '').trim();
  if (dateFilter === 'today') return d === getTodayISO();
  if (dateFilter === 'tomorrow') return d === getTomorrowISO();
  return true;
}
  // ---------- "МОЙ КАЛЕНДАРЬ" (пока локально, без бэка) ----------
  const LS_KEY = 'myCalendarIds';
  const MY = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

  function saveMy() {
    localStorage.setItem(LS_KEY, JSON.stringify([...MY]));
  }
  function ensureEnrolled(id) {
    MY.add(id); saveMy();
  }
  function removeEnrolled(id) {
    MY.delete(id); saveMy();
  }

  // ---------- ФИЛЬТРЫ ----------
  function applyFilters(items) {
    const t = (trainerFilter.value || '').toLowerCase();
    const g = (tagFilter.value || '').toLowerCase();
    return items.filter(it => {
      const okTrainer = !t || (it.trainer || '').toLowerCase() === t;
      const okTag     = !g || (it.tag || '').toLowerCase() === g;
      return okTrainer && okTag;
    });
  }

  function populateFilters(items) {
    const trainers = unique(items.map(i => i.trainer));
    const tags = unique(items.map(i => i.tag));
    trainerFilter.innerHTML = '<option value="">Все тренеры</option>' + trainers.map(v => `<option>${v}</option>`).join('');
    tagFilter.innerHTML = '<option value="">Все территории</option>' + tags.map(v => `<option>${v}</option>`).join('');
  }

  // ---------- РЕНДЕР СПИСКА ----------
  let rawItems = [];

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
        card.dataset.id = makeId(it); // пригодится в модалке
        card.dataset.link = it.link || '#';
        card.dataset.title = it.title || '';
        card.dataset.time = it.time || '';
        card.dataset.trainer = it.trainer || '';
        card.dataset.tag = it.tag || '';

        const isMine = MY.has(card.dataset.id);

        card.innerHTML = `
          <div class="title">${it.time ? (it.time + ' — ') : ''}${it.title || 'Без названия'}</div>
          <div class="meta">
            ${it.trainer ? ('Тренер: ' + it.trainer) : ''}${it.trainer && it.tag ? ' · ' : ''}${it.tag ? ('Тег: ' + it.tag) : ''}
            ${isMine ? ' · ✅ в моём календаре' : ''}
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

  // ---------- МОДАЛКА ----------
  let currentCard = null;

  function openModal(cardEl) {
    currentCard = cardEl;

    const t = cardEl.dataset.title;
    const time = cardEl.dataset.time;
    const trainer = cardEl.dataset.trainer;
    const tag = cardEl.dataset.tag;
    const id = cardEl.dataset.id;

    modalTitle.textContent = `${time ? (time + ' — ') : ''}${t || 'Без названия'}`;
    modalMeta.textContent = [
      trainer ? `Тренер: ${trainer}` : '',
      tag ? `Тег: ${tag}` : '',
      MY.has(id) ? 'В моём календаре' : ''
    ].filter(Boolean).join(' · ');

    // показываем/прячем кнопки по состоянию
    modalBtnEnroll.style.display = MY.has(id) ? 'none' : '';
    modalBtnUnenroll.style.display = MY.has(id) ? '' : 'none';

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    currentCard = null;
  }

  // ---------- ЗАГРУЗКА ----------
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

  // ---------- СЛУШАТЕЛИ ----------
  trainerFilter.addEventListener('change', () => render(rawItems));
  tagFilter.addEventListener('change', () => render(rawItems));
  resetBtn.addEventListener('click', () => {
  trainerFilter.value = '';
  tagFilter.value = '';
  setDateFilter('all');      // ← вернём «Все»
});
  refreshBtn.addEventListener('click', () => location.reload());

  function setDateFilter(val) {
  dateFilter = val; // 'all' | 'today' | 'tomorrow'
  // подсветка активной кнопки
  [dateAllBtn, todayBtn, tomorrowBtn].forEach(btn =>
    btn.classList.toggle('is-active', 
      (btn === dateAllBtn && val === 'all') ||
      (btn === todayBtn && val === 'today') ||
      (btn === tomorrowBtn && val === 'tomorrow')
    )
  );
  render(rawItems);
}

dateAllBtn.addEventListener('click', () => setDateFilter('all'));
todayBtn.addEventListener('click', () => setDateFilter('today'));
tomorrowBtn.addEventListener('click', () => setDateFilter('tomorrow'));
  // Клик по карточке — открыть модалку
  app.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    openModal(card);
  });

  // Кнопки модалки
  modalClose.addEventListener('click', closeModal);
  modal.querySelector('.overlay').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

  modalBtnOpen.addEventListener('click', () => {
    if (!currentCard) return;
    const url = currentCard.dataset.link;
    const id = currentCard.dataset.id;
    // авто-зачёт в "мой календарь"
    ensureEnrolled(id);
    render(rawItems);
    // предупреждение про браузер
    const note = '⚠️ Сайт может открываться только в Яндекс.Браузере или при установленном сертификате Минцифры. Открыть сейчас?';
    if (confirm(note)) window.open(url, '_blank', 'noopener,noreferrer');
  });

  modalBtnCopy.addEventListener('click', async () => {
    if (!currentCard) return;
    const url = currentCard.dataset.link;
    const id = currentCard.dataset.id;
    // авто-зачёт в "мой календарь"
    ensureEnrolled(id);
    render(rawItems);
    try {
      await (navigator.clipboard?.writeText(url) || Promise.reject());
      alert('Ссылка скопирована.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); alert('Ссылка скопирована.'); }
      catch { alert('Не удалось скопировать. Скопируйте вручную: ' + url); }
      document.body.removeChild(ta);
    }
  });

  modalBtnEnroll.addEventListener('click', () => {
    if (!currentCard) return;
    ensureEnrolled(currentCard.dataset.id);
    render(rawItems);
    openModal(currentCard); // обновить состояние кнопок
  });

  modalBtnUnenroll.addEventListener('click', () => {
    if (!currentCard) return;
    removeEnrolled(currentCard.dataset.id);
    render(rawItems);
    openModal(currentCard); // обновить состояние кнопок
  });

  load();
})();
