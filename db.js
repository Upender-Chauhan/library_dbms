/* Database connection + first-run seed */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'library.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function seed() {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)')
      .run('admin', bcrypt.hashSync('admin123', 10), 'Eleanor Whitfield', 'Librarian');

    const addBook = db.prepare(`INSERT INTO books (title, author, isbn, genre, pub_year, shelf, total_copies, rating)
                                VALUES (?,?,?,?,?,?,?,?)`);
    [
      ['The Midnight Library', 'Matt Haig', '978-0525559474', 'Fiction', 2020, 'F-12', 4, 4.5],
      ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '978-0062316097', 'History', 2015, 'H-04', 3, 4.7],
      ['Atomic Habits', 'James Clear', '978-0735211292', 'Self-Help', 2018, 'S-21', 5, 4.8],
      ['Dune', 'Frank Herbert', '978-0441013593', 'Sci-Fi', 1965, 'SF-01', 3, 4.9],
      ['The Silent Patient', 'Alex Michaelides', '978-1250301697', 'Thriller', 2019, 'T-09', 2, 4.3],
      ['Educated', 'Tara Westover', '978-0399590504', 'Memoir', 2018, 'M-06', 3, 4.6],
      ['Clean Code', 'Robert C. Martin', '978-0132350884', 'Technology', 2008, 'TC-03', 2, 4.4],
      ['The Alchemist', 'Paulo Coelho', '978-0062315007', 'Fiction', 1988, 'F-02', 6, 4.5],
      ['A Brief History of Time', 'Stephen Hawking', '978-0553380163', 'Science', 1988, 'SC-11', 2, 4.6],
      ['Gone Girl', 'Gillian Flynn', '978-0307588371', 'Thriller', 2012, 'T-14', 3, 4.2],
    ].forEach(b => addBook.run(...b));

    const addMember = db.prepare(`INSERT INTO members (full_name, email, phone, plan, status, joined_on)
                                  VALUES (?,?,?,?,?,?)`);
    [
      ['Aditya Sharma', 'aditya.sharma@example.com', '98100-22334', 'Annual', 'Active', '2024-02-11'],
      ['Priya Nair', 'priya.nair@example.com', '99887-11002', 'Annual', 'Active', '2023-11-04'],
      ['Rahul Verma', 'rahul.verma@example.com', '97123-88010', 'Monthly', 'Active', '2025-01-19'],
      ['Sana Khan', 'sana.khan@example.com', '96543-22781', 'Annual', 'Suspended', '2024-07-30'],
      ['Vikram Patel', 'vikram.patel@example.com', '98765-43210', 'Monthly', 'Active', '2025-03-02'],
    ].forEach(m => addMember.run(...m));

    // Loans use dates relative to "today" so the demo always shows a realistic mix.
    // (book_id, member_id, days_ago_issued, loan_days, returned_after_days | null)
    const addLoan = db.prepare(`INSERT INTO loans (book_id, member_id, issue_date, due_date, return_date)
      VALUES (?, ?, date('now','localtime', ?), date('now','localtime', ?, ?), CASE WHEN ? IS NULL THEN NULL ELSE date('now','localtime', ?, ?) END)`);
    const loan = (book, member, ago, days, retAfter) => addLoan.run(
      book, member, `-${ago} days`, `-${ago} days`, `+${days} days`,
      retAfter, `-${ago} days`, `+${retAfter === null ? 0 : retAfter} days`);

    // history (returned)
    loan(1, 2, 60, 14, 13);   // on time
    loan(3, 1, 50, 14, 16);   // late
    loan(8, 5, 40, 14, 10);   // on time
    loan(2, 3, 35, 14, 20);   // late
    // open loans
    loan(2, 1, 5, 14, null);  // issued
    loan(2, 5, 3, 14, null);  // issued
    loan(4, 3, 30, 14, null); // overdue
    loan(4, 1, 2, 14, null);  // issued
    loan(4, 2, 1, 14, null);  // issued
    loan(7, 5, 25, 14, null); // overdue
    loan(7, 2, 4, 14, null);  // issued
    loan(5, 3, 6, 14, null);  // issued
    loan(1, 3, 8, 14, null);  // issued
    loan(1, 5, 7, 14, null);  // issued
    loan(9, 1, 20, 14, null); // overdue
    loan(6, 2, 9, 14, null);  // issued
    loan(10, 3, 10, 14, null);// issued
  });
  tx();
}

if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) seed();

module.exports = db;
