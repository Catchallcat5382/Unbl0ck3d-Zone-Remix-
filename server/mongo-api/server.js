import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 8787);
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'unblocked_zone';
const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';

if (!mongoUri) throw new Error('MONGODB_URI is required');

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

const mongo = new MongoClient(mongoUri);
await mongo.connect();
const db = mongo.db(dbName);
const users = db.collection('users');
const messages = db.collection('messages');
const posts = db.collection('posts');
const audit = db.collection('audit');
await users.createIndex({ username: 1 }, { unique: true });
await users.createIndex({ lastSeen: -1 });

function cleanUsername(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24);
}
function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || 'member',
    bannedUntil: user.bannedUntil || null,
    kickedUntil: user.kickedUntil || null,
    mutedUntil: user.mutedUntil || null,
    lastSeen: user.lastSeen || null
  };
}
function tokenFor(user) {
  return jwt.sign({ id: String(user._id), username: user.username, role: user.role || 'member' }, jwtSecret, { expiresIn: '30d' });
}
async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const data = jwt.verify(token, jwtSecret);
    const user = await users.findOne({ _id: new ObjectId(data.id) });
    if (!user) return res.status(401).json({ error: 'Account deleted.' });
    if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) return res.status(403).json({ error: 'This account is banned.', banned: true });
    if (user.kickedUntil && new Date(user.kickedUntil) > new Date()) return res.status(403).json({ error: 'This account is kicked temporarily.', kicked: true });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Sign in required.' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed.' });
}
async function log(req, action, detail) {
  await audit.insertOne({ action, detail, by: req.user?.username || 'system', at: new Date() });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/signup', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || '');
  if (username.length < 2 || password.length < 6) return res.status(400).json({ error: 'Username or password too short.' });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await users.insertOne({ username, passwordHash, role: 'member', createdAt: new Date(), lastSeen: new Date() });
    const user = await users.findOne({ _id: result.insertedId });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch {
    res.status(409).json({ error: 'Account already exists.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const user = await users.findOne({ username });
  if (!user) return res.status(404).json({ error: 'Account does not exist.' });
  if (!(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Username or password incorrect.' });
  if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) return res.status(403).json({ error: 'This account is banned.', banned: true });
  await users.updateOne({ _id: user._id }, { $set: { lastSeen: new Date() } });
  res.json({ token: tokenFor(user), user: publicUser({ ...user, lastSeen: new Date() }) });
});

app.get('/me', auth, async (req, res) => {
  await users.updateOne({ _id: req.user._id }, { $set: { lastSeen: new Date() } });
  res.json({ user: publicUser({ ...req.user, lastSeen: new Date() }) });
});

app.get('/members', auth, async (_req, res) => {
  const rows = await users.find({}, { projection: { passwordHash: 0 } }).sort({ role: 1, username: 1 }).toArray();
  res.json({ members: rows.map(publicUser) });
});

app.get('/messages', auth, async (_req, res) => {
  res.json({ messages: await messages.find({}).sort({ createdAt: -1 }).limit(100).toArray() });
});
app.post('/messages', auth, async (req, res) => {
  const body = String(req.body.body || '').slice(0, 1000).trim();
  if (!body) return res.status(400).json({ error: 'Message required.' });
  await messages.insertOne({ userId: req.user._id, username: req.user.username, body, createdAt: new Date() });
  await log(req, 'message', body.slice(0, 80));
  res.json({ ok: true });
});

app.get('/posts', auth, async (_req, res) => {
  res.json({ posts: await posts.find({}).sort({ createdAt: -1 }).limit(100).toArray() });
});
app.post('/posts', auth, requireRole('owner', 'admin', 'mod'), async (req, res) => {
  const title = String(req.body.title || '').slice(0, 120).trim();
  const body = String(req.body.body || '').slice(0, 7000).trim();
  if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });
  await posts.insertOne({ userId: req.user._id, username: req.user.username, title, body, createdAt: new Date() });
  await log(req, 'post', title);
  res.json({ ok: true });
});

app.post('/staff/moderate', auth, requireRole('owner', 'admin', 'mod'), async (req, res) => {
  const target = cleanUsername(req.body.username);
  const action = String(req.body.action || '').toLowerCase();
  const targetUser = await users.findOne({ username: target });
  if (!targetUser) return res.status(404).json({ error: 'Target not found.' });
  if (targetUser.role === 'owner' && req.user.username !== targetUser.username) return res.status(403).json({ error: 'Owners cannot moderate other owners.' });
  const minutes = Number(req.body.minutes || 10);
  const until = new Date(Date.now() + Math.max(1, minutes) * 60000);
  const update = {};
  if (action === 'warn') update.$inc = { warnings: 1 };
  else if (action === 'mute') update.$set = { mutedUntil: until };
  else if (action === 'kick') update.$set = { kickedUntil: until };
  else if (action === 'ban' && req.user.role === 'owner') update.$set = { bannedUntil: new Date('2099-01-01'), role: 'banned' };
  else if (action === 'unban' && req.user.role === 'owner') update.$set = { bannedUntil: null, role: 'member' };
  else return res.status(403).json({ error: 'Action not allowed for your role.' });
  await users.updateOne({ _id: targetUser._id }, update);
  await log(req, action, target);
  res.json({ ok: true });
});

app.get('/audit', auth, requireRole('owner', 'admin'), async (_req, res) => {
  res.json({ audit: await audit.find({}).sort({ at: -1 }).limit(300).toArray() });
});

app.listen(port, () => console.log(`Mongo API listening on ${port}`));
