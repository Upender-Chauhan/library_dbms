/* =========================================================
   BIBLIOTHECA — shared front-end helpers
   Data lives in the SQLite database behind the /api routes.
   ========================================================= */

/* ---------- API ---------- */
async function api(method, url, body){
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try{ data = await res.json(); }catch(e){}
  const onLogin = location.pathname === '/' || location.pathname.endsWith('index.html');
  if(res.status === 401 && !onLogin){ window.location.href = 'index.html'; }
  if(!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  return data;
}

/* ---------- small utilities ---------- */
function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
function todayISO(){            // local date, not UTC
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' });
}

/* ---------- auth ---------- */
async function requireAuth(){
  try{ return await api('GET', '/api/session'); }
  catch(e){ window.location.href = 'index.html'; return null; }
}
async function logout(){
  try{ await api('POST', '/api/logout'); }catch(e){}
  window.location.href = 'index.html';
}

/* ---------- shared UI: toast ---------- */
function toast(msg){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.classList.remove('show'), 2800);
}

/* ---------- shared UI: modal ---------- */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

/* ---------- render shell (sidebar) into any page ---------- */
function renderShell(activePage, s){
  const shellEl = document.getElementById('shell');
  if(!shellEl) return;

  const tabs = [
    { key:'dashboard', href:'dashboard.html', label:'Dashboard', idx:'01' },
    { key:'books', href:'books.html', label:'Catalog', idx:'02' },
    { key:'members', href:'members.html', label:'Members', idx:'03' },
    { key:'transactions', href:'transactions.html', label:'Circulation', idx:'04' },
    { key:'reports', href:'reports.html', label:'Reports', idx:'05' },
  ];

  shellEl.innerHTML = `
    <nav class="drawer-nav">
      <div class="brand">
        <div class="mark">Bibliotheca</div>
        <div class="sub">Card Catalog System</div>
      </div>
      <div class="drawer-tabs">
        ${tabs.map(t => `
          <a href="${t.href}" class="${t.key===activePage?'active':''}">
            <span class="tab-index">${t.idx}</span> ${t.label}
          </a>`).join('')}
      </div>
      <div class="drawer-foot">
        <div class="who">${s ? esc(s.name) : ''}</div>
        <div class="role">${s ? esc(s.role) : ''}</div>
        <a href="#" class="logout-link" onclick="logout();return false;">Sign out ↦</a>
      </div>
    </nav>
    <main class="main" id="main-content"></main>
  `;
}

/* ---------- ledger bar (top) ---------- */
function renderLedgerBar(){
  const bar = document.getElementById('ledger-bar');
  if(!bar) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'2-digit', year:'numeric' });
  bar.innerHTML = `<div>Bibliotheca <span class="dot">·</span> Reading Room Ledger</div><div>${dateStr}</div>`;
}

/* ---------- page bootstrap ---------- */
async function startPage(activePage, loadFn){
  const s = await requireAuth();
  if(!s) return;
  renderLedgerBar();
  renderShell(activePage, s);
  try{ await loadFn(); }
  catch(e){ toast(e.message); }
}
