/* Bibliotheca — Express API on top of SQLite */
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
   saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 }
}));

/* ---------- helpers ---------- */
const wrap = fn => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    const msg = String(e.message || e);
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (msg.includes('books.isbn')) return res.status(409).json({ error: 'A book with this ISBN already exists.' });
      if (msg.includes('members.email')) return res.status(409).json({ error: 'A member with this email already exists.' });
      return res.status(409).json({ error: 'Duplicate value.' });
    }
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || msg.includes('FOREIGN KEY constraint failed')) {
      return res.status(409).json({ error: 'Cannot delete — this record is referenced by circulation history.' });
    }
    if (e.code === 'SQLITE_CONSTRAINT_TRIGGER') {
      return res.status(409).json({ error: msg });           // our RAISE(ABORT, '...') business-rule messages
    }
    if (e.code && e.code.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(400).json({ error: 'Invalid data: ' + msg });
    }
    if (e.status) return res.status(e.status).json({ error: msg });
    console.error(e);
    res.status(500).json({ error: 'Server error.' });
  }
};
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const str = (v, name) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw bad(`${name} is required.`);
  return s;
};
const int = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}.`);
  return n;
};
const isoDate = (v, name) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${name} must be a valid date.`);
  return v;
};
const requireAuth = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Not signed in.' });

/* ---------- auth ---------- */
app.post('/api/login', wrap((req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password. Try admin / admin123.' });
  }
  req.session.user = { id: u.user_id, name: u.full_name, role: u.role };
  return req.session.user;
}));
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/session', requireAuth, (req, res) => res.json(req.session.user));

/* everything below needs a session */
app.use('/api', requireAuth);

/* ---------- books ---------- */
const BOOK_SELECT = `SELECT book_id AS id, title, author, isbn, genre, pub_year AS year, shelf,
                            total_copies AS copies, available_copies AS available, rating
                     FROM v_books`;
const bookFields = b => [
  str(b.title, 'Title'), str(b.author, 'Author'), str(b.isbn, 'ISBN'), str(b.genre, 'Genre'),
  int(b.year, 'Publication year', 1000, 2100), str(b.shelf, 'Shelf location'), int(b.copies, 'Total copies', 1, 10000)
];

app.get('/api/books', wrap(() => db.prepare(BOOK_SELECT + ' ORDER BY title').all()));

app.post('/api/books', wrap((req, res) => {
  const info = db.prepare(`INSERT INTO books (title, author, isbn, genre, pub_year, shelf, total_copies)
                           VALUES (?,?,?,?,?,?,?)`).run(...bookFields(req.body || {}));
  res.status(201);
  return db.prepare(BOOK_SELECT + ' WHERE book_id = ?').get(info.lastInsertRowid);
}));

app.put('/api/books/:id', wrap(req => {
  const info = db.prepare(`UPDATE books SET title=?, author=?, isbn=?, genre=?, pub_year=?, shelf=?, total_copies=?
                           WHERE book_id=?`).run(...bookFields(req.body || {}), req.params.id);
  if (!info.changes) throw bad('Book not found.', 404);
  return db.prepare(BOOK_SELECT + ' WHERE book_id = ?').get(req.params.id);
}));

app.delete('/api/books/:id', wrap(req => {
  const info = db.prepare('DELETE FROM books WHERE book_id = ?').run(req.params.id);
  if (!info.changes) throw bad('Book not found.', 404);
  return { ok: true };
}));

/* ---------- members ---------- */
const MEMBER_SELECT = `SELECT m.member_id AS id, m.full_name AS name, m.email, m.phone, m.plan AS membership,
                              m.status, m.joined_on AS joined,
                              (SELECT COUNT(*) FROM loans l WHERE l.member_id = m.member_id AND l.return_date IS NULL) AS onLoan
                       FROM members m`;
const memberFields = m => {
  const plan = str(m.membership, 'Plan'), status = str(m.status, 'Status');
  if (!['Monthly', 'Annual'].includes(plan)) throw bad('Plan must be Monthly or Annual.');
  if (!['Active', 'Suspended'].includes(status)) throw bad('Status must be Active or Suspended.');
  const email = str(m.email, 'Email');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Email is not valid.');
  return [str(m.name, 'Name'), email, str(m.phone, 'Phone'), plan, status];
};

app.get('/api/members', wrap(() => db.prepare(MEMBER_SELECT + ' ORDER BY m.full_name').all()));

app.post('/api/members', wrap((req, res) => {
  const info = db.prepare(`INSERT INTO members (full_name, email, phone, plan, status) VALUES (?,?,?,?,?)`)
                 .run(...memberFields(req.body || {}));
  res.status(201);
  return db.prepare(MEMBER_SELECT + ' WHERE m.member_id = ?').get(info.lastInsertRowid);
}));

app.put('/api/members/:id', wrap(req => {
  const info = db.prepare(`UPDATE members SET full_name=?, email=?, phone=?, plan=?, status=? WHERE member_id=?`)
                 .run(...memberFields(req.body || {}), req.params.id);
  if (!info.changes) throw bad('Member not found.', 404);
  return db.prepare(MEMBER_SELECT + ' WHERE m.member_id = ?').get(req.params.id);
}));

app.delete('/api/members/:id', wrap(req => {
  const info = db.prepare('DELETE FROM members WHERE member_id = ?').run(req.params.id);
  if (!info.changes) throw bad('Member not found.', 404);
  return { ok: true };
}));

/* ---------- loans (circulation) ---------- */
const LOAN_SELECT = `SELECT loan_id AS id, book_id AS bookId, member_id AS memberId, title AS bookTitle,
                            full_name AS memberName, issue_date AS issueDate, due_date AS dueDate,
                            return_date AS returnDate, status,
                            CASE WHEN status = 'Overdue'
                                 THEN CAST(julianday(date('now','localtime')) - julianday(due_date) AS INTEGER)
                                 ELSE 0 END AS daysLate
                     FROM v_loans`;

app.get('/api/loans', wrap(() => db.prepare(LOAN_SELECT + ' ORDER BY issue_date DESC, loan_id DESC').all()));

app.post('/api/loans', wrap((req, res) => {
  const b = req.body || {};
  const bookId = int(b.bookId, 'Book', 1, Number.MAX_SAFE_INTEGER);
  const memberId = int(b.memberId, 'Member', 1, Number.MAX_SAFE_INTEGER);
  const issueDate = isoDate(b.issueDate, 'Issue date');
  const period = int(b.period, 'Loan period', 1, 60);
  const info = db.prepare(`INSERT INTO loans (book_id, member_id, issue_date, due_date)
                           VALUES (?, ?, ?, date(?, '+' || ? || ' days'))`)
                 .run(bookId, memberId, issueDate, issueDate, period);
  res.status(201);
  return db.prepare(LOAN_SELECT + ' WHERE loan_id = ?').get(info.lastInsertRowid);
}));

app.post('/api/loans/:id/return', wrap(req => {
  const info = db.prepare(`UPDATE loans SET return_date = date('now','localtime')
                           WHERE loan_id = ? AND return_date IS NULL`).run(req.params.id);
  if (!info.changes) throw bad('Loan not found or already returned.', 404);
  return db.prepare(LOAN_SELECT + ' WHERE loan_id = ?').get(req.params.id);
}));

/* ---------- dashboard & reports (aggregate SQL) ---------- */
app.get('/api/dashboard', wrap(() => {
  const stats = db.prepare(`
    SELECT (SELECT COUNT(*) FROM books)                                         AS titles,
           (SELECT COALESCE(SUM(total_copies),0) FROM books)                    AS totalCopies,
           (SELECT COALESCE(SUM(available_copies),0) FROM v_books)              AS available,
           (SELECT COUNT(*) FROM v_loans WHERE status IN ('Issued','Overdue'))  AS issued,
           (SELECT COUNT(*) FROM v_loans WHERE status = 'Overdue')              AS overdue,
           (SELECT COUNT(*) FROM members WHERE status = 'Active')               AS activeMembers,
           (SELECT COUNT(*) FROM members)                                       AS totalMembers`).get();
  const recent = db.prepare(LOAN_SELECT + ' ORDER BY issue_date DESC, loan_id DESC LIMIT 6').all();
  const genres = db.prepare(`SELECT genre, SUM(total_copies) AS copies FROM books
                             GROUP BY genre ORDER BY copies DESC, genre LIMIT 5`).all();
  return { stats, recent, genres };
}));

app.get('/api/reports', wrap(() => {
  const mostBorrowed = db.prepare(`
    SELECT b.title, COUNT(*) AS borrows
    FROM loans l JOIN books b ON b.book_id = l.book_id
    GROUP BY b.book_id ORDER BY borrows DESC, b.title LIMIT 5`).all();
  const plans = db.prepare(`SELECT plan, COUNT(*) AS members FROM members GROUP BY plan ORDER BY plan`).all();
  const returns = db.prepare(`
    SELECT COALESCE(SUM(return_date <= due_date), 0) AS onTime,
           COALESCE(SUM(return_date >  due_date), 0) AS late
    FROM loans WHERE return_date IS NOT NULL`).get();
  const overdue = db.prepare(LOAN_SELECT + ` WHERE status = 'Overdue' ORDER BY daysLate DESC`).all();
  return { mostBorrowed, plans, returns, overdue };
}));

/* ---------- static front-end ---------- */
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bibliotheca running at http://localhost:${PORT}`));
