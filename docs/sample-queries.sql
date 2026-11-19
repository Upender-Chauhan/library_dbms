-- Sample queries for demo / viva. Run with:  sqlite3 library.db < docs/sample-queries.sql
.headers on
.mode column

-- 1. Catalog with live availability (view)
SELECT title, total_copies, available_copies FROM v_books ORDER BY title;

-- 2. All overdue loans with days late (JOIN via view)
SELECT title, full_name, due_date,
       CAST(julianday(date('now','localtime')) - julianday(due_date) AS INTEGER) AS days_late
FROM v_loans WHERE status = 'Overdue' ORDER BY days_late DESC;

-- 3. Most borrowed titles (GROUP BY + aggregate)
SELECT b.title, COUNT(*) AS times_borrowed
FROM loans l JOIN books b ON b.book_id = l.book_id
GROUP BY b.book_id ORDER BY times_borrowed DESC LIMIT 5;

-- 4. Members with more than 2 books currently out (HAVING)
SELECT m.full_name, COUNT(*) AS on_loan
FROM loans l JOIN members m ON m.member_id = l.member_id
WHERE l.return_date IS NULL
GROUP BY m.member_id HAVING COUNT(*) > 2;

-- 5. Books never borrowed (LEFT JOIN / anti-join)
SELECT b.title FROM books b LEFT JOIN loans l ON l.book_id = b.book_id WHERE l.loan_id IS NULL;

-- 6. Genre share of the collection (aggregate + subquery)
SELECT genre, SUM(total_copies) AS copies,
       ROUND(100.0 * SUM(total_copies) / (SELECT SUM(total_copies) FROM books), 1) AS pct
FROM books GROUP BY genre ORDER BY copies DESC;

-- 7. Demonstrate a trigger: issuing to a suspended member fails
INSERT INTO loans (book_id, member_id, issue_date, due_date) VALUES (3, 4, date('now'), date('now','+14 days'));
-- Error: Member is not active and cannot borrow.

-- 8. Demonstrate referential integrity: deleting a book with history fails
DELETE FROM books WHERE book_id = 1;
-- Error: FOREIGN KEY constraint failed
