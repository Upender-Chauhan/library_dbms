-- =========================================================
-- BIBLIOTHECA — Library Management System
-- Relational schema (SQLite dialect; standard SQL elsewhere)
-- =========================================================

PRAGMA foreign_keys = ON;

-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Librarian'
);

CREATE TABLE IF NOT EXISTS books (
  book_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  author       TEXT NOT NULL,
  isbn         TEXT NOT NULL UNIQUE,
  genre        TEXT NOT NULL,
  pub_year     INTEGER NOT NULL CHECK (pub_year BETWEEN 1000 AND 2100),
  shelf        TEXT NOT NULL,
  total_copies INTEGER NOT NULL CHECK (total_copies >= 1),
  rating       REAL NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5)
);

CREATE TABLE IF NOT EXISTS members (
  member_id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  phone     TEXT NOT NULL,
  plan      TEXT NOT NULL CHECK (plan IN ('Monthly', 'Annual')),
  status    TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  joined_on TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS loans (
  loan_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(book_id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(member_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  issue_date  TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  return_date TEXT,                       -- NULL = still on loan
  CHECK (due_date >= issue_date),
  CHECK (return_date IS NULL OR return_date >= issue_date)
);

CREATE INDEX IF NOT EXISTS idx_loans_book   ON loans(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_member ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_open   ON loans(return_date);

-- ---------- Business rules as triggers ----------

-- Only active members may borrow.
CREATE TRIGGER IF NOT EXISTS trg_loan_member_active
BEFORE INSERT ON loans
WHEN (SELECT status FROM members WHERE member_id = NEW.member_id) <> 'Active'
BEGIN
  SELECT RAISE(ABORT, 'Member is not active and cannot borrow.');
END;

-- A copy must be available.
CREATE TRIGGER IF NOT EXISTS trg_loan_copy_available
BEFORE INSERT ON loans
WHEN NEW.return_date IS NULL AND
     (SELECT total_copies FROM books WHERE book_id = NEW.book_id) <=
     (SELECT COUNT(*) FROM loans WHERE book_id = NEW.book_id AND return_date IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'No copies of this title are currently available.');
END;

-- At most 5 books on loan per member.
CREATE TRIGGER IF NOT EXISTS trg_loan_member_limit
BEFORE INSERT ON loans
WHEN NEW.return_date IS NULL AND
     (SELECT COUNT(*) FROM loans WHERE member_id = NEW.member_id AND return_date IS NULL) >= 5
BEGIN
  SELECT RAISE(ABORT, 'Member has reached the limit of 5 books on loan.');
END;

-- A member cannot hold two open loans of the same title.
CREATE TRIGGER IF NOT EXISTS trg_loan_no_duplicate
BEFORE INSERT ON loans
WHEN NEW.return_date IS NULL AND
     EXISTS (SELECT 1 FROM loans WHERE member_id = NEW.member_id AND book_id = NEW.book_id AND return_date IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'This member already has this title on loan.');
END;

-- Total copies may not drop below the number currently on loan.
CREATE TRIGGER IF NOT EXISTS trg_books_copies_floor
BEFORE UPDATE OF total_copies ON books
WHEN NEW.total_copies < (SELECT COUNT(*) FROM loans WHERE book_id = NEW.book_id AND return_date IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Total copies cannot be less than the copies currently on loan.');
END;

-- ---------- Views (derived data is never stored, so it cannot go stale) ----------

CREATE VIEW IF NOT EXISTS v_books AS
SELECT b.*,
       b.total_copies - COUNT(l.loan_id) AS available_copies
FROM books b
LEFT JOIN loans l ON l.book_id = b.book_id AND l.return_date IS NULL
GROUP BY b.book_id;

CREATE VIEW IF NOT EXISTS v_loans AS
SELECT l.*,
       b.title,
       m.full_name,
       CASE
         WHEN l.return_date IS NOT NULL                    THEN 'Returned'
         WHEN l.due_date < date('now', 'localtime')        THEN 'Overdue'
         ELSE 'Issued'
       END AS status
FROM loans l
JOIN books   b ON b.book_id   = l.book_id
JOIN members m ON m.member_id = l.member_id;
