/* AnnaSetu frontend: talks to the FastAPI backend at /api/* */

let AREAS = {}, NGOS = [], CATS = {}, SAMPLE_ANALYSIS = null;

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtH = h => h < 1 ? Math.max(0, Math.round(h * 60)) + " min" : (Math.round(h * 10) / 10).toFixed(1) + " h";
const clock = d => d.toLocaleTimeString("en-IN", {hour: "numeric", minute: "2-digit"});
const nf = n => Math.round(n).toLocaleString("en-IN");
function toast(t){ const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2600); }

async function api(path, opts = {}){
  let res;
  try { res = await fetch(path, opts); }
  catch(e){ throw new Error("Can't reach the AnnaSetu server. Is uvicorn running?"); }
  let data = null; try { data = await res.json(); } catch(e) {}
  if(!res.ok) throw new Error((data && data.detail) || `Server error ${res.status}`);
  return data;
}
const post = (path, body) => api(path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});

/* ---------- state ---------- */
const state = {analysis: null, analysisSource: "sample", imageURL: null, imageBlob: null, rescue: null, lang: "hi", sim: null};

function readForm(){
  return {donor: $("#fDonor").value.trim() || "Donor", type: $("#fType").value, area: $("#fArea").value,
    cookedAgo: parseFloat($("#fCooked").value), storage: $("#fStorage").value,
    temp: parseFloat($("#fTemp").value) || 25, humidity: parseFloat($("#fHum").value) || 45};
}

/* ---------- photo ---------- */
async function downscale(file){
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
}

async function analyzePhoto(){
  const msg = $("#analyzeMsg");
  if(!state.imageBlob){ msg.innerHTML = `<div class="banner warn">Upload a photo first, or use the sample buffet below.</div>`; return; }
  const btn = $("#analyzeBtn"); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Analyzing…`; msg.innerHTML = "";
  try{
    const fd = new FormData(); fd.append("image", state.imageBlob, "food.jpg");
    const out = await api("/api/analyze", {method: "POST", body: fd});
    if(!out.analysis.is_food){ msg.innerHTML = `<div class="banner warn">The AI couldn't find cooked food in this photo. Try a clearer photo of the dishes from above.</div>`; return; }
    state.analysis = out.analysis; state.analysisSource = out.source;
    await renderAnalysis();
    if(out.source === "sample") msg.innerHTML = `<div class="banner warn">No GEMINI_API_KEY is set on the server, so the sample analysis is shown. Add a key to .env to analyze real photos.</div>`;
    else toast("AI analysis complete");
  }catch(e){
    msg.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`;
  }finally{ btn.disabled = false; btn.textContent = "Analyze with AI"; }
}

/* ---------- render: donate ---------- */
const BUFFET_SVG = `<svg viewBox="0 0 400 220" role="img" aria-label="Illustration of buffet chafing dishes">
<rect x="0" y="150" width="400" height="70" fill="var(--line)"/>
${[[30,"#E9B949"],[125,"#C4631A"],[220,"#E8C27A"],[315,"#8E4B2A"]].map(([x,c],i)=>`
<ellipse cx="${x+40}" cy="150" rx="46" ry="10" fill="var(--muted)" opacity=".35"/>
<rect x="${x}" y="108" width="80" height="40" rx="6" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>
<ellipse cx="${x+40}" cy="110" rx="38" ry="9" fill="${c}"/>
${i%2?`<path d="M${x+6} 106 Q${x+40} 70 ${x+74} 106" fill="none" stroke="var(--muted)" stroke-width="2"/>`:""}
<path d="M${x+30} 98 q4 -8 0 -16 M${x+42} 96 q4 -8 0 -16 M${x+54} 98 q4 -8 0 -16" stroke="var(--muted)" stroke-width="1.6" fill="none" opacity=".6"/>`).join("")}
</svg>`;
function renderDrop(){
  const inner = $("#dropInner");
  if(state.imageURL){ inner.innerHTML = `<img alt="Uploaded food photo" src="${state.imageURL}">`; $("#dropCap").textContent = "Your photo"; }
  else { inner.innerHTML = BUFFET_SVG; $("#dropCap").textContent = "Sample: wedding buffet surplus"; }
}

let renderToken = 0;
async function renderAnalysis(){
  const an = state.analysis, f = readForm(), token = ++renderToken;
  let dishes;
  try { dishes = (await post("/api/shelf-life", {dishes: an.dishes, form: f})).dishes; }
  catch(e){ $("#analysisBody").innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; return; }
  if(token !== renderToken) return; // a newer render started
  $("#analysisSrc").textContent = state.analysisSource === "ai" ? "From your photo · AI vision" : "Sample analysis";
  const maxW = Math.max(...dishes.map(d => d.life.safeWindow));
  const ok = dishes.filter(d => d.life.status !== "unsafe");
  const deadline = ok.length ? Math.min(...ok.map(d => d.life.remaining)) : 0;
  const statusTxt = {ok: "Safe", urgent: "Deliver fast", unsafe: "Don't donate"};
  const colors = {ok: "var(--leaf)", urgent: "var(--warn)", unsafe: "var(--bad)"};
  $("#analysisBody").innerHTML = `
    ${state.analysisSource === "sample" ? `<div class="sample-note">Sample data. Upload your own food photo above and tap Analyze with AI to replace it.</div>` : ""}
    <p>${esc(an.summary || "")}</p>
    <div class="stats">
      <div class="stat"><span class="k">Meals it can feed</span><span class="v"><input id="mealsIn" type="number" min="1" value="${an.total_meals}" aria-label="Meals it can feed" style="width:100%;max-width:110px;font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:0 6px"></span><span class="s">AI estimate, editable</span></div>
      <div class="stat"><span class="k">Weight</span><span class="v">${nf(an.est_weight_kg)} kg</span><span class="s">approx.</span></div>
      <div class="stat ${deadline < 1.5 ? "urgent" : "good"}"><span class="k">Safe window left</span><span class="v">${ok.length ? fmtH(deadline) : "None"}</span><span class="s">for the most fragile dish</span></div>
      <div class="stat"><span class="k">Dishes</span><span class="v">${dishes.length}</span><span class="s">${dishes.filter(d => d.veg).length} veg · ${dishes.filter(d => !d.veg).length} non-veg</span></div>
    </div>
    <div class="grid2">
      <div>${dishes.map(d => `
        <div class="dish">
          <div><span class="name">${esc(d.name)}</span><span class="hi">${esc(d.hindi_name)}</span>
            <div class="meta"><span class="chip ${d.veg ? "veg" : "nonveg"}">${d.veg ? "Veg" : "Non-veg"}</span><span>${esc((CATS[d.category] || {}).label || d.category)}</span><span class="num">~${d.est_servings} portions</span><span>${Math.round(d.confidence * 100)}% sure</span></div></div>
          <div style="text-align:right"><span class="chip ${d.life.status}">${statusTxt[d.life.status]}</span><div class="num hint" style="margin-top:4px">${d.life.remaining > 0 ? fmtH(d.life.remaining) + " left" : "expired"}</div></div>
          <div class="lifebar" title="Remaining share of the safe window"><span style="width:${Math.max(2, Math.min(100, d.life.remaining / maxW * 100))}%;background:${colors[d.life.status]}"></span></div>
        </div>`).join("")}</div>
      <div class="card" style="background:var(--bg)">
        <h3>What the AI noticed</h3>
        <ul class="flags">${(an.quality_flags || []).map(q => `<li>${esc(q)}</li>`).join("") || "<li>No issues spotted.</li>"}</ul>
        <h3>How shelf life is worked out</h3>
        <p class="hint">Each dish type has a safe holding time (rice and non-veg are the most fragile). It changes with storage: kept hot above 60°C holds 6 h or more, room temperature is short and shrinks above 30°C or in high humidity, and the fridge holds 24 h. A 20% safety margin is applied, then the time since cooking is subtracted. Unsafe dishes are left out of the donation automatically.</p>
      </div>
    </div>`;
  $("#mealsIn").addEventListener("change", e => { state.analysis.total_meals = Math.max(1, Math.round(+e.target.value || 1)); });
}

/* ---------- render: rescue ---------- */
const B = {latMin: 26.765, latMax: 26.965, lngMin: 75.72, lngMax: 75.885};
const P = (lat, lng) => [(lng - B.lngMin) / (B.lngMax - B.lngMin) * 420 + 20, (B.latMax - lat) / (B.latMax - B.latMin) * 520 + 20];
function routePoints(r){ return [[r.vol.lat, r.vol.lng], r.donor, ...r.alloc.map(a => [a.lat, a.lng])].map(p => P(p[0], p[1])); }
function mapSVG(r){
  const pts = routePoints(r);
  const grid = []; for(let i = 0; i <= 8; i++){ const x = 20 + i * 52.5; grid.push(`<line x1="${x}" y1="20" x2="${x}" y2="540"/>`); } for(let j = 0; j <= 10; j++){ const y = 20 + j * 52; grid.push(`<line x1="20" y1="${y}" x2="440" y2="${y}"/>`); }
  const areas = Object.entries(AREAS).map(([n, [la, ln]]) => { const [x, y] = P(la, ln); return `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="var(--muted)" opacity=".75">${esc(n)}</text>`; }).join("");
  const chosen = new Set(r.alloc.map(a => a.id));
  const ngos = NGOS.map(n => { const [x, y] = P(n.lat, n.lng); const c = chosen.has(n.id); const idx = r.alloc.findIndex(a => a.id === n.id);
    return `<g><circle cx="${x}" cy="${y}" r="${c ? 11 : 6}" fill="${c ? "var(--leaf)" : "var(--surface)"}" stroke="var(--leaf)" stroke-width="2"/>${c ? `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--surface)">${idx + 1}</text><text x="${x + 15}" y="${y + 4}" font-size="11" font-weight="600" fill="var(--ink)">${esc(n.name.split(" ").slice(0, 2).join(" "))}</text>` : ""}</g>`; }).join("");
  const [dx, dy] = P(r.donor[0], r.donor[1]); const [vx, vy] = pts[0];
  return `<svg viewBox="0 0 460 560" role="img" aria-label="Schematic map of Jaipur with the pickup route">
    <rect x="0" y="0" width="460" height="560" fill="var(--bg)"/>
    <g stroke="var(--line)" stroke-width="1">${grid.join("")}</g>
    <ellipse cx="235" cy="285" rx="150" ry="215" fill="none" stroke="var(--line)" stroke-width="6" opacity=".9"/>
    ${areas}
    <polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="2 9"/>
    ${ngos}
    <g><rect x="${dx - 10}" y="${dy - 10}" width="20" height="20" rx="4" fill="var(--accent)" stroke="var(--accent-ink)" stroke-width="1.5"/><text x="${dx}" y="${dy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent-ink)">D</text></g>
    <circle cx="${vx}" cy="${vy}" r="7" fill="var(--sky)"/>
    <circle id="mover" cx="${vx}" cy="${vy}" r="9" fill="var(--sky)" stroke="var(--surface)" stroke-width="3"/>
    <text x="24" y="550" font-size="10" fill="var(--muted)">Schematic · ring road shown as oval · not to exact scale</text>
  </svg>`;
}

function renderRescue(){
  const body = $("#rescueBody"), r = state.rescue;
  if(!r){ body.innerHTML = `<div class="card empty"><p>No active rescue yet.</p><button class="btn primary" id="goMatch">Plan the sample rescue</button></div>`; $("#goMatch").onclick = () => runMatch(); $("#rescueId").textContent = ""; return; }
  $("#rescueId").innerHTML = `<span class="mono">${esc(r.id)}</span> · ${esc(r.form.donor)}, ${esc(r.form.area)}`;
  if(r.blocked){ body.innerHTML = `<div class="banner bad">${esc(r.blocked)}</div><div class="row"><a class="btn" href="#donate">Back to donation details</a></div>`; return; }
  const sim = state.sim; const step = sim ? sim.step : (r.status === "delivered" ? r.legs.length : -1);
  const msgs = r.msgs;
  body.innerHTML = `
    <div class="stats">
      <div class="stat good"><span class="k">Meals matched</span><span class="v">${r.meals - r.unallocated}</span><span class="s">of ${r.meals} meals</span></div>
      <div class="stat ${r.deadlineH < 1.5 ? "urgent" : ""}"><span class="k">Safe until</span><span class="v">${clock(new Date(r.safeUntil))}</span><span class="s">${fmtH(r.deadlineH)} left at match time</span></div>
      <div class="stat"><span class="k">Last drop</span><span class="v">${clock(new Date(r.finishAt))}</span><span class="s">${Math.round((r.safeUntil - r.finishAt) / 60000)} min before the safe-until time</span></div>
      <div class="stat"><span class="k">Route</span><span class="v">${r.totalKm.toFixed(1)} km</span><span class="s">${r.alloc.length} stop${r.alloc.length > 1 ? "s" : ""} · ${esc(r.vol.vehicle)}</span></div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-head"><h3>Matching agent's decision</h3><span class="hint">${msgs.src === "ai" ? "Written by AI" : r.aiPending ? '<span class="spinner"></span> AI writing…' : "Template"}</span></div>
        <div class="agent"><div class="who">AnnaSetu agent</div>${esc(msgs.rationale)}</div>
        ${r.alloc.map((a, i) => `
          <div class="ngo">
            <div class="ngo-top">
              <div><h3>${i + 1}. ${esc(a.name)}</h3><div class="hint">${esc(a.area)} · ${esc(a.serves)} · ${a.vegOnly ? "Veg only" : "Veg and non-veg"}</div></div>
              <div class="alloc num">${a.total}<small>meals</small></div>
            </div>
            <div class="bars">
              <span>Proximity</span><span class="b"><span style="width:${a.proximity * 100}%"></span></span><span class="num">${a.km.toFixed(1)} km</span>
              <span>Need tonight</span><span class="b"><span style="width:${a.needFit * 100}%"></span></span><span class="num">${a.open} open</span>
              <span>Diet fit</span><span class="b"><span style="width:${a.dietFit * 100}%"></span></span><span class="num">${Math.round(a.dietFit * 100)}%</span>
              <span>Priority</span><span class="b"><span style="width:${a.priority * 100}%"></span></span><span class="num">${a.priority.toFixed(2)}</span>
            </div>
            <div class="row" style="justify-content:space-between"><span class="hint">Score <span class="num">${a.score.toFixed(2)}</span> · arrives <span class="num">${clock(new Date(a.arrive))}</span></span>
              <span class="chip ${r.accepted && r.accepted[a.id] ? "ok" : "neutral"}">${r.accepted && r.accepted[a.id] ? "NGO confirmed" : "Waiting for YES"}</span></div>
          </div>`).join("")}
        ${r.unallocated > 0 ? `<div class="banner warn">${r.unallocated} meals have no NGO with room tonight. The agent suggests a compost or biogas partner for these.</div>` : ""}
        <details><summary class="hint" style="cursor:pointer">Why not the other ${NGOS.length - r.alloc.length} NGOs?</summary>
          <div class="others" style="margin-top:8px">${r.ranked.filter(n => !r.alloc.find(a => a.id === n.id)).map(n => `<div class="o"><span>${esc(n.name)}</span><span class="hint">${esc(n.reason || "Lower score: farther away or less need")} · <span class="num">${n.km.toFixed(1)} km</span></span></div>`).join("")}</div>
        </details>
      </div>
      <div class="card">
        <div class="card-head"><h3>Pickup route</h3><span class="hint">Volunteer ${esc(r.vol.name)} · ${esc(r.vol.vehicle)} (fits ${r.vol.cap})</span></div>
        <div class="mapwrap">${mapSVG(r)}</div>
        <div class="legend"><span><i style="background:var(--sky)"></i>Volunteer</span><span><i style="background:var(--accent);border-radius:3px"></i>Donor</span><span><i style="background:var(--leaf)"></i>Chosen NGO</span><span><i style="border:2px solid var(--leaf);background:var(--surface)"></i>Other NGO</span></div>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-head"><h3>Live tracking</h3>
          <button class="btn primary small" id="simBtn" ${sim || r.status !== "matched" ? "disabled" : ""}>${r.status === "delivered" ? "Delivered" : r.status !== "matched" ? "In progress…" : "Dispatch volunteer"}</button></div>
        <ol class="timeline">
          <li class="${step >= 0 || r.status !== "matched" ? "done" : "now"}"><span class="mk"></span><span>Matched and NGOs alerted on WhatsApp</span><span class="t">${clock(new Date(r.created))}</span></li>
          ${r.legs.map((l, i) => `<li class="${i < step ? "done" : i === step ? "now" : ""}"><span class="mk"></span><span>${esc(l.label)}</span><span class="t">${clock(new Date(l.at))}</span></li>`).join("")}
        </ol>
        <p class="hint">Human in the loop: each NGO replies YES before the volunteer is dispatched. Every step is logged with a timestamp for the audit trail.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>WhatsApp alerts</h3>
          <div class="seg" role="group" aria-label="Message language"><button type="button" data-lang="hi" aria-pressed="${state.lang === "hi"}">हिन्दी</button><button type="button" data-lang="en" aria-pressed="${state.lang === "en"}">English</button></div></div>
        ${r.alloc.map(a => { const m = msgs.ngo.find(x => x.id === a.id); return `<div><div class="hint" style="margin-bottom:4px">To ${esc(a.name)}</div><div class="msg">${esc(m[state.lang])}</div></div>`; }).join("")}
        <div><div class="hint" style="margin-bottom:4px">To volunteer ${esc(r.vol.name)}</div><div class="msg">${esc(msgs.volunteer[state.lang])}</div></div>
        <div class="row"><button class="btn small" id="copyMsgs" type="button">Copy messages</button></div>
      </div>
    </div>`;
  body.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { state.lang = b.dataset.lang; renderRescue(); });
  const sb = $("#simBtn"); if(sb) sb.onclick = startSim;
  $("#copyMsgs").onclick = async () => {
    const t = r.alloc.map(a => `To ${a.name}:\n${msgs.ngo.find(x => x.id === a.id)[state.lang]}`).join("\n\n") + `\n\nTo ${r.vol.name}:\n${msgs.volunteer[state.lang]}`;
    try { await navigator.clipboard.writeText(t); toast("Messages copied"); } catch(e) { toast("Copy isn't allowed here"); }
  };
  if(sim) placeMover(sim.progress);
}

function placeMover(prog){
  const r = state.rescue, el = $("#mover"); if(!el) return;
  const pts = routePoints(r); const seg = []; let tot = 0;
  for(let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
  let target = prog * tot, i = 0; while(i < seg.length - 1 && target > seg[i]){ target -= seg[i]; i++; }
  const f = seg[i] ? Math.min(1, target / seg[i]) : 1; const a = pts[i], b = pts[i + 1] || pts[i];
  el.setAttribute("cx", a[0] + (b[0] - a[0]) * f); el.setAttribute("cy", a[1] + (b[1] - a[1]) * f);
}

function startSim(){
  const r = state.rescue; if(!r || r.status !== "matched") return;
  r.accepted = {}; r.status = "confirming"; renderRescue();
  let k = 0;
  const tick = () => {
    if(k < r.alloc.length){ r.accepted[r.alloc[k].id] = true; toast(`${r.alloc[k].name} replied YES`); k++; renderRescue(); setTimeout(tick, 700); }
    else go();
  };
  setTimeout(tick, 500);
  function go(){
    r.status = "enroute";
    const pts = routePoints(r); const seg = []; let tot = 0;
    for(let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
    const cum = [0]; seg.forEach(d => cum.push(cum[cum.length - 1] + d));
    const legEnd = r.legs.map((l, i) => i < 2 ? cum[1] / tot : cum[i] / tot);
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 2000 : 12000;
    const t0 = performance.now();
    state.sim = {progress: 0, step: 0}; renderRescue();
    const frame = now => {
      const p = Math.min(1, (now - t0) / dur); state.sim.progress = p;
      let step = legEnd.findIndex(e => p < e - 1e-6); if(step === -1) step = r.legs.length;
      if(step !== state.sim.step){ state.sim.step = step; renderRescue(); } else placeMover(p);
      if(p < 1) requestAnimationFrame(frame); else finish();
    };
    requestAnimationFrame(frame);
  }
  async function finish(){
    state.sim = null; r.status = "delivered"; renderRescue();
    const meals = r.meals - r.unallocated;
    try{
      await post("/api/rescues/complete", {id: r.id, donor: r.form.donor, area: r.form.area, meals,
        kg: Math.round(meals * r.weightKg / Math.max(1, r.meals) * 10) / 10, ngos: r.alloc.map(a => a.name)});
      await renderImpact();
      toast("All meals delivered. Impact certificate ready in the Impact tab.");
    }catch(e){ toast(e.message); }
  }
}

async function runMatch(){
  const btn = $("#matchBtn"); btn.disabled = true;
  try{
    const r = await post("/api/plan", {analysis: state.analysis, form: readForm()});
    r.aiPending = !r.blocked && state.aiOn;
    state.rescue = r; state.sim = null; location.hash = "rescue"; showView("rescue"); renderRescue();
    if(r.aiPending){
      try{ const m = await post("/api/messages", {rescue: r}); if(state.rescue === r){ r.msgs = m; } }catch(e){}
      r.aiPending = false; if(state.rescue === r && !state.sim) renderRescue();
    }
  }catch(e){ toast(e.message); }
  finally{ btn.disabled = false; }
}

/* ---------- render: impact ---------- */
function barChart(data, {h = 170, accentLast = false, dashed = false} = {}){
  const W = 520, pad = {l: 34, r: 8, t: 12, b: 26}; const max = Math.ceil(Math.max(...data.map(d => d.v)) / 100) * 100 || 100;
  const bw = (W - pad.l - pad.r) / data.length; const y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Bar chart">
   ${[0, max / 2, max].map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${pad.l - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${nf(t)}</text>`).join("")}
   ${data.map((d, i) => { const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64; const last = i === data.length - 1;
     return `<rect x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(0, y(0) - y(d.v))}" rx="3" fill="${accentLast && last ? "var(--accent)" : dashed ? "var(--accent-soft)" : "var(--leaf)"}" ${dashed ? 'stroke="var(--accent)" stroke-dasharray="3 3"' : ""}/>
     ${i % 2 === 0 || data.length <= 8 ? `<text x="${x + w / 2}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(d.l)}</text>` : ""}
     ${last ? `<text x="${x + w / 2}" y="${y(d.v) - 4}" font-size="10" text-anchor="middle" fill="var(--ink)" font-family="IBM Plex Mono, monospace">${nf(d.v)}</text>` : ""}`; }).join("")}
  </svg>`;
}
async function renderImpact(){
  let d;
  try { d = await api("/api/impact"); } catch(e){ $("#impactBody").innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; return; }
  const t = d.totals, last = d.last;
  const certText = last ? `AnnaSetu Impact Certificate\nDonor: ${last.donor}, ${last.area}\nDate: ${new Date(last.at).toLocaleString("en-IN")}\nMeals rescued: ${last.meals}\nFood diverted from landfill: ${last.kg} kg\nEstimated CO2e avoided: ${last.co2} kg\nReceived by: ${last.ngos.join(", ")}\nAudit ID: ${last.audit}` : "";
  $("#impactBody").innerHTML = `
    <div class="stats">
      <div class="stat good"><span class="k">Meals rescued · 14 days</span><span class="v">${nf(t.meals)}</span><span class="s">${t.mine} from your rescues</span></div>
      <div class="stat"><span class="k">Food saved</span><span class="v">${nf(t.kg)} kg</span><span class="s">kept out of landfill</span></div>
      <div class="stat"><span class="k">CO₂e avoided</span><span class="v">${(t.co2 / 1000).toFixed(1)} t</span><span class="s">at 2.5 kg CO₂e per kg</span></div>
      <div class="stat"><span class="k">Food value</span><span class="v">₹${(t.value / 100000).toFixed(1)}L</span><span class="s">at ₹60 per meal</span></div>
    </div>
    <div class="grid2">
      <div class="card chart"><div class="card-head"><h3>Meals rescued per day</h3><span class="hint">Last 14 days · today highlighted</span></div>${barChart(d.daily, {accentLast: true})}</div>
      <div class="card chart"><div class="card-head"><h3>Surplus forecast</h3><span class="hint">Next 7 days · wedding season and weekends</span></div>${barChart(d.forecast, {dashed: true})}
        <p class="hint">The forecast lets NGOs line up volunteers before big wedding dates. November and December are peak wedding season, so it adds 25%, and weekends add 35%.</p></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-head"><h3>Top donors</h3><span class="hint">Meals, 14 days</span></div>
        <div class="board">${d.board.map((b, i) => `<div class="r"><span class="num hint">${i + 1}</span><span>${esc(b.n)}</span><span class="num">${nf(b.m)}</span></div>`).join("")}</div></div>
      <div class="card"><div class="card-head"><h3>CSR / ESG certificate</h3><span class="hint">One per donation, audit-ready</span></div>
        ${last ? `<div class="cert">
          <div class="ttl">Impact Certificate</div>
          <dl><dt>Donor</dt><dd>${esc(last.donor)}, ${esc(last.area)}</dd>
          <dt>Date</dt><dd>${new Date(last.at).toLocaleString("en-IN", {dateStyle: "medium", timeStyle: "short"})}</dd>
          <dt>Meals</dt><dd class="num">${last.meals}</dd>
          <dt>Food saved</dt><dd class="num">${last.kg} kg</dd>
          <dt>CO₂e avoided</dt><dd class="num">${last.co2} kg</dd>
          <dt>Received by</dt><dd>${last.ngos.map(esc).join(", ")}</dd>
          <dt>Audit ID</dt><dd class="mono">${esc(last.audit)}</dd></dl>
          <div class="row"><button class="btn small" id="copyCert" type="button">Copy certificate</button></div></div>`
        : `<div class="empty"><p>Finish a rescue to issue a certificate with an audit ID.</p><a class="btn primary" href="#rescue">Go to Rescue</a></div>`}
      </div>
    </div>`;
  const cc = $("#copyCert"); if(cc) cc.onclick = async () => { try { await navigator.clipboard.writeText(certText); toast("Certificate copied"); } catch(e) { toast("Copy isn't allowed here"); } };
}

/* ---------- views ---------- */
function showView(v){
  if(!["donate", "rescue", "impact"].includes(v)) v = "donate";
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("active", s.id === "view-" + v));
  document.querySelectorAll("nav.tabs a").forEach(a => { if(a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

/* ---------- start ---------- */
(async function init(){
  showView(location.hash.slice(1) || "donate");
  try{
    const [health, data] = await Promise.all([api("/api/health"), api("/api/data")]);
    AREAS = data.areas; NGOS = data.ngos; CATS = data.cats; SAMPLE_ANALYSIS = data.sample;
    state.aiOn = health.ai;
    const pill = $("#aiPill"); pill.classList.add(health.ai ? "on" : "off");
    $("#aiPillText").textContent = health.ai ? `AI on · ${health.model}` : "Sample mode (no API key)";
  }catch(e){
    $("#view-donate").insertAdjacentHTML("afterbegin", `<div class="banner bad">${esc(e.message)} Start it with: uvicorn backend.main:app --reload</div>`);
    return;
  }
  state.analysis = structuredClone(SAMPLE_ANALYSIS);

  $("#fArea").innerHTML = Object.keys(AREAS).map(a => `<option ${a === "Malviya Nagar" ? "selected" : ""}>${esc(a)}</option>`).join("");
  let deb;
  const upd = () => { $("#oCooked").textContent = parseFloat($("#fCooked").value).toFixed(1) + " h"; clearTimeout(deb); deb = setTimeout(renderAnalysis, 150); };
  ["fCooked", "fStorage", "fTemp", "fHum"].forEach(id => $("#" + id).addEventListener("input", upd));

  const file = $("#file"), drop = $("#drop");
  const take = async f => {
    if(!f || !f.type.startsWith("image/")) return;
    if(state.imageURL) URL.revokeObjectURL(state.imageURL);
    state.imageURL = URL.createObjectURL(f); renderDrop();
    $("#analyzeMsg").innerHTML = `<div class="hint">Photo ready. Tap Analyze with AI.</div>`;
    try { state.imageBlob = await downscale(f); } catch(e) { state.imageBlob = f; }
  };
  file.addEventListener("change", e => take(e.target.files[0]));
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files[0]); });
  $("#analyzeBtn").onclick = analyzePhoto;
  $("#sampleBtn").onclick = () => {
    state.analysis = structuredClone(SAMPLE_ANALYSIS); state.analysisSource = "sample";
    if(state.imageURL) URL.revokeObjectURL(state.imageURL);
    state.imageURL = null; state.imageBlob = null; file.value = ""; renderDrop(); $("#analyzeMsg").innerHTML = ""; renderAnalysis();
  };
  $("#matchBtn").onclick = runMatch;

  renderDrop(); renderAnalysis(); renderImpact(); renderRescue();
})();
