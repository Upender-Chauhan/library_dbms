# Bibliotheca — Library Management System

Catalog management, member records, book issue/return (circulation), a dashboard and reports,
backed by a real **SQLite relational database** through a small **Node.js + Express** API.

## Running it

Requires [Node.js](https://nodejs.org) 18 or newer.

```
cd library-system
npm install
npm start
```

Then open **http://localhost:3000**. (Opening the HTML files directly with a double-click no longer
works, because the pages need the server and database.)

The database file `library.db` is created and seeded automatically on first start.
To wipe it and start fresh: `npm run reset-db`, then `npm start` again.

## Login

- **Username:** `admin`
- **Password:** `admin123` (stored as a bcrypt hash in the `users` table)

## Project layout

| Path | Purpose |
|------|---------|
| `schema.sql` | Tables, keys, CHECK constraints, indexes, triggers and views |
| `db.js` | Opens the database, applies the schema, seeds demo data on first run |
| `server.js` | Express REST API and static file server |
| `public/` | The front-end pages (`index`, `dashboard`, `books`, `members`, `transactions`, `reports`) |
| `public/assets/app.js` | Shared front-end helpers (`api()` fetch wrapper, modals, toast, sidebar) |
| `public/assets/style.css` | Design system |
| `docs/ER-diagram.md` | ER diagram (Mermaid) and design notes |
| `docs/sample-queries.sql` | Example SQL for demo / viva |

## Database design

Four tables: `users`, `books`, `members`, `loans` (loans links books and members, 1:N from each side).

- Primary keys, `UNIQUE` (ISBN, email, username), `NOT NULL`, `CHECK` and foreign keys with `ON DELETE RESTRICT`.
- **Views** `v_books` (live available copies) and `v_loans` (Issued / Overdue / Returned computed from dates),
  so derived values are never stored and cannot become inconsistent.
- **Triggers** enforce the rules inside the database itself: active members only, copy must be available,
  max 5 open loans per member, no duplicate open loan of the same title, and total copies can't be reduced below
  the number on loan.

See `docs/ER-diagram.md` for the diagram.

## API (all except login require a session)

| Method & route | Action |
|---|---|
| `POST /api/login`, `POST /api/logout`, `GET /api/session` | Authentication |
| `GET/POST /api/books`, `PUT/DELETE /api/books/:id` | Catalog |
| `GET/POST /api/members`, `PUT/DELETE /api/members/:id` | Members |
| `GET/POST /api/loans`, `POST /api/loans/:id/return` | Circulation |
| `GET /api/dashboard`, `GET /api/reports` | Aggregate SQL queries |

## Viewing the database directly

```
sqlite3 library.db
sqlite> .tables
sqlite> SELECT * FROM v_books;
```

or open `library.db` in [DB Browser for SQLite](https://sqlitebrowser.org).

## Using MySQL / PostgreSQL instead

`schema.sql` is mostly standard SQL. To switch, replace `better-sqlite3` in `db.js` with `mysql2` or `pg`
(queries in `server.js` become `await` calls), change `AUTOINCREMENT` to `AUTO_INCREMENT` / `SERIAL`,
`date('now')` to `CURDATE()` / `CURRENT_DATE`, and rewrite the triggers in that dialect.
