// server.js
// npm i express cors mongodb crypto
import express from 'express';
import cors from 'cors';
import { MongoClient, Long } from 'mongodb';
import crypto from 'crypto';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// ==== КОНФИГ ====
const MONGO_URI = process.env.MONGO_URI;                 // mongodb://iren:***@176.113.82.239:27017/irenTestBotDb?authSource=admin
const DB_NAME   = process.env.DB_NAME || 'irenTestBotDb';
const BOT_TOKEN = process.env.BOT_TOKEN;                 // токен твоего TG-бота
let client, db;

// Подключение к БД (лениво)
async function getDB() {
  if (!client) {
    client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
    await client.connect();
    db = client.db(DB_NAME);
  }
  return db;
}

// Проверка initData (официально)
function verifyInitData(initData) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  p.delete('hash');

  const dataCheckString = [...p.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) return null;

  const userRaw = p.get('user');
  if (!userRaw) return null;
  const user = JSON.parse(userRaw);
  return { tgId: user.id }; // number
}

// Утилита: сегодняшняя дата YYYY-MM-DD
const pad2 = n => String(n).padStart(2,'0');
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };

// Основной эндпоинт: профиль + расписание по роли
app.post('/api/bootstrap', async (req, res) => {
  try {
    // 1) auth
    const initData = req.body?.initData || req.get('x-telegram-init-data') || '';
    let auth = verifyInitData(initData);

    // DEV-хак для локалки: /api/bootstrap?tgId=6384797183
    if (!auth && process.env.NODE_ENV !== 'production' && req.query.tgId) {
      auth = { tgId: Number(req.query.tgId) };
    }
    if (!auth) return res.status(401).json({ error: 'invalid_init_data' });

    const db = await getDB();
    const Users  = db.collection('users');
    const Events = db.collection('events');

    // 2) ищем пользователя
    // У тебя _id хранится как Long('6384797183'). В драйвере: Long.fromString(...)
    const idAsLong = Long.fromString(String(auth.tgId));
    let profile = await Users.findOne(
      { _id: idAsLong },
      { projection: { _id: 0, role: 1, first_name: 1 } }
    );

    // fallback: если вдруг _id обычным числом (редко, но бывает)
    if (!profile) {
      profile = await Users.findOne(
        { _id: auth.tgId },
        { projection: { _id: 0, role: 1, first_name: 1 } }
      );
    }

    const role = profile?.role || null;

    // 3) фильтр событий по роли + не в прошлом (по дате)
    const today = todayISO();
    const baseFilter = { date: { $gte: today } };

    // если роли нет в профиле — отдадим всё ближайшее (на твоё усмотрение)
    const filter = role
      ? { ...baseFilter, $or: [ { roles: role }, { roles: 'all' } ] }
      : baseFilter;

    const items = await Events.find(filter)
      .project({ _id: 0, date: 1, time: 1, title: 1, trainer: 1, link: 1, roles: 1, tag: 1 })
      .sort({ date: 1, time: 1 })
      .toArray();

    res.set('Cache-Control','no-store');
    res.json({ user: { tgId: auth.tgId, role }, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API listening on', port));
