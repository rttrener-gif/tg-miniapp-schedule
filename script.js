// DOM-ссылки
const app = document.getElementById('app');
const refreshBtn   = document.getElementById('refreshBtn');
const dateAllBtn   = document.getElementById('dateAllBtn');
const todayBtn     = document.getElementById('todayBtn');
const tomorrowBtn  = document.getElementById('tomorrowBtn');
const modal        = document.getElementById('modal');
const modalTitle   = document.getElementById('modalTitle');
const modalMeta    = modal.querySelector('.modal-meta');
const modalBtnOpen = modal.querySelector('.open-link');
const modalBtnCopy = modal.querySelector('.copy-link');
const modalBtnEnroll   = modal.querySelector('.enroll');
const modalBtnUnenroll = modal.querySelector('.unenroll');
const modalClose   = modal.querySelector('.close');

if (window.Telegram?.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
}

// --- Глобальные переменные ---
let rawItems   = [];
let dateFilter = 'all';  // all | today | tomorrow
let currentCard = null;
const LS_KEY = 'myCalendarIds';
const MY = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

// --- Константы API ---
const API_BASE = 'https://d5d9iu74vcsqbtsmida6.trruwy79.apigw.yandexcloud.net';

// --- Вспомогательные функции даты/времени ---
const pad2 = n => String(n).padStart(2,'0');
const getTodayISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const getTomorrowISO = () => { const d=new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const nowHM = () => { const d=new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function isPast(item) {
  const d = (item.date || '').trim();
  const t = (item.time || '').trim();
  const today = getTodayISO();
  if (!d) return false;
  if (d < today) return true;
  if (d === today && t && t < nowHM()) return true;
  return false;
}

// --- Мой календарь (локально) ---
function saveMy() { localStorage.setItem(LS_KEY, JSON.stringify([...MY])); }
function ensureEnrolled(id) { MY.add(id); saveMy(); }
function removeEnrolled(id) { MY.delete(id); saveMy(); }

// --- Работа с датами/фильтрами ---
function matchDateFilter(item) {
  if (dateFilter === 'today')    return item.date === getTodayISO();
  if (dateFilter === 'tomorrow') return item.date === getTomorrowISO();
  return true;
}
function setDateFilter(val) {
  dateFilter = val;
  [dateAllBtn, todayBtn, tomorrowBtn].forEach(btn =>
    btn.classList.toggle('is-active',
      (btn === dateAllBtn && val === 'all') ||
      (btn === todayBtn && val === 'today') ||
      (btn === tomorrowBtn && val === 'tomorrow')
    )
  );
  render(rawItems);
}

// --- Получение данных с сервера ---
async function bootstrap() {
  const initData = window.Telegram?.WebApp?.initData || '';

  if (initData) {
    // Внутри Telegram — POST с initData и заголовком
    const res = await fetch(`${API_BASE}/api/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    if (!res.ok) throw new Error('bootstrap_failed');
    return res.json();
  } else {
    // Тест в браузере — чистый GET без заголовков (чтобы не было preflight)
    const res = await fetch(`${API_BASE}/api/bootstrap${location.search || ''}`, {
      method: 'GET'
      // без headers!
    });
    if (!res.ok) throw new Error('bootstrap_failed');
    return res.json();
  }
}

// --- Рендер ---
function groupByDate(items) {
  return items.reduce((acc, it) => {
    const d = it.date;
    if (!d) return acc;
    (acc[d] ||= []).push(it);
    return acc;
  }, {});
}

function makeId(it) {
  return `${(it.date||'').trim()}_${(it.time||'').trim()}_${(it.title||'').trim()}`.toLowerCase();
}

function applyFilters(items) {
  return items
    .filter(it => !isPast(it))
    .filter(matchDateFilter);
}

function render(items) {
  const filtered = applyFilters(items);
  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort();

  app.innerHTML = '';
  if (!dates.length) {
    app.textContent =
      dateFilter === 'today'    ? 'Увы, на сегодня практикумов уже нет 😢' :
      dateFilter === 'tomorrow' ? 'На завтра пока ничего нет. Загляните позже 🙂' :
                                  'Подходящих занятий не найдено.';
    return;
  }

  dates.forEach(d => {
    const sec = document.createElement('section');
    sec.className = 'day';
    const h = document.createElement('h3');
    h.textContent = d;
    sec.appendChild(h);

    grouped[d].sort((a,b) => (a.time||'').localeCompare(b.time||'')).forEach(it => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = makeId(it);
      card.dataset.link = it.link || '#';
      card.dataset.title = it.title || '';
      card.dataset.time = it.time || '';
      card.dataset.trainer = it.trainer || '';
      card.dataset.tag = it.tag || '';

      const isMine = MY.has(card.dataset.id);
      card.innerHTML = `
        <div class="title">${it.time ? it.time + ' — ' : ''}${it.title}</div>
        <div class="meta">
          ${it.trainer ? 'Тренер: ' + it.trainer : ''}${it.trainer && it.tag ? ' · ' : ''}${it.tag ? 'Тег: ' + it.tag : ''}
          ${isMine ? ' · ✅ в моём календаре' : ''}
        </div>`;
      app.appendChild(sec).appendChild(card);
    });
  });
}

// --- Модалка ---
function openModal(card) {
  currentCard = card;
  modalTitle.textContent = `${card.dataset.time ? card.dataset.time + ' — ' : ''}${card.dataset.title}`;
  modalMeta.textContent = [
    card.dataset.trainer ? `Тренер: ${card.dataset.trainer}` : '',
    card.dataset.tag ? `Тег: ${card.dataset.tag}` : '',
    MY.has(card.dataset.id) ? 'В моём календаре' : ''
  ].filter(Boolean).join(' · ');
  modal.classList.remove('hidden');
}
function closeModal() {
  if (document.activeElement && modal.contains(document.activeElement)) document.activeElement.blur();
  modal.classList.add('hidden');
  currentCard = null;
}

// --- Загрузка ---
function load() {
  app.textContent = 'Загрузка…';
  bootstrap()
    .then(({ user, items }) => {
      rawItems = Array.isArray(items) ? items : [];
      if (!rawItems.length) { app.textContent = 'Подходящих практикумов не найдено.'; return; }
      render(rawItems);
    })
    .catch(err => {
      console.error(err);
      app.textContent = 'Ошибка загрузки расписания.';
    });
}

// --- Слушатели ---
refreshBtn.addEventListener('click', () => location.reload());
dateAllBtn.addEventListener('click', () => setDateFilter('all'));
todayBtn.addEventListener('click', () => setDateFilter('today'));
tomorrowBtn.addEventListener('click', () => setDateFilter('tomorrow'));
app.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (card) openModal(card);
});
modalClose.addEventListener('click', closeModal);
modal.querySelector('.overlay').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
modalBtnOpen.addEventListener('click', () => {
  if (!currentCard) return;
  ensureEnrolled(currentCard.dataset.id);
  render(rawItems);
  const note = '⚠️ Сайт может открываться только в Яндекс.Браузере или при установленном сертификате Минцифры. Открыть сейчас?';
  if (confirm(note)) window.open(currentCard.dataset.link, '_blank', 'noopener,noreferrer');
});
modalBtnCopy.addEventListener('click', async () => {
  if (!currentCard) return;
  ensureEnrolled(currentCard.dataset.id);
  render(rawItems);
  try {
    await (navigator.clipboard?.writeText(currentCard.dataset.link) || Promise.reject());
    alert('Ссылка скопирована.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = currentCard.dataset.link;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); alert('Ссылка скопирована.'); }
    catch { alert('Не удалось скопировать. Скопируйте вручную: ' + currentCard.dataset.link); }
    document.body.removeChild(ta);
  }
});
modalBtnEnroll.addEventListener('click', () => {
  if (!currentCard) return;
  ensureEnrolled(currentCard.dataset.id);
  render(rawItems);
  openModal(currentCard);
});
modalBtnUnenroll.addEventListener('click', () => {
  if (!currentCard) return;
  removeEnrolled(currentCard.dataset.id);
  render(rawItems);
  openModal(currentCard);
});

// --- Старт ---
load();
