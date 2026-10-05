import React, { useEffect, useState, useRef } from "react";
import LeadsPage from "./LeadsPage";
import ReactMarkdown from "react-markdown";

const API = "http://127.0.0.1:8000";

const CITIES = [
  { label: "Oslo", q: "Oslo, programvare" },
  { label: "Bergen", q: "Bergen, programvare" },
  { label: "Trondheim", q: "Trondheim, programvare" },
  { label: "Stavanger", q: "Stavanger, programvare" },
  { label: "Kristiansand", q: "Kristiansand, programvare" },
  { label: "Drammen", q: "Drammen, programvare" },
  { label: "Fredrikstad", q: "Fredrikstad, programvare" },
  { label: "Moss", q: "Moss, programvare" },
  { label: "Asker", q: "Asker, programvare" },
  { label: "Bærum", q: "Bærum, programvare" },
  { label: "Lillestrøm", q: "Lillestrøm, programvare" },
  { label: "Sandnes", q: "Sandnes, programvare" },
  { label: "Haugesund", q: "Haugesund, programvare" },
  { label: "Ålesund", q: "Ålesund, programvare" },
  { label: "Tromsø", q: "Tromsø, programvare" },
  { label: "Bodø", q: "Bodø, programvare" },
  { label: "Tønsberg", q: "Tønsberg, programvare" },
  { label: "Sandefjord", q: "Sandefjord, programvare" },
  { label: "Skien", q: "Skien, programvare" },
  { label: "Lillehammer", q: "Lillehammer, programvare" },
  { label: "Hamar", q: "Hamar, programvare" },
];

function isShellCompany(lead) {
  const name = String(lead?.company || lead?.navn || "").toUpperCase();
  return /\b(HOLDCO|MIDCO|NEWCO|HOLDING|INVEST|INVESTMENT|EIENDOM|PROPERTY)\b/.test(name);
}

function dashEmailQuality(lead) {
  const raw = String(lead.email || "").trim().toLowerCase();
  if (!raw) return "None";
  const local = raw.split("@")[0] || "";
  if (/^(post|firmapost|postmottak|mail|info|kontakt|contact|office|hello|hi|support|admin)$/.test(local)) return "Weak";
  return "Good";
}

function dashFitReason(lead) {
  return dashFitDetail(lead).now;
}

function dashFit(lead) {
  return dashFitDetail(lead).score;
}

function dashFitDetail(lead) {
  const staff = Number(lead.employees || 0);
  const y = Number(String(lead.founded || "").slice(0, 4) || 0);
  const age = y ? new Date().getFullYear() - y : null;
  const q = dashEmailQuality(lead);
  let score = 38;
  if (staff >= 2 && staff <= 12) score += 24;
  else if (staff >= 13 && staff <= 25) score += 16;
  else if (staff >= 26 && staff <= 40) score += 8;
  else if (staff >= 41 && staff <= 80) score += 1;
  else if (staff > 80) score -= 10;
  if (age == null) {
    /* no year */
  } else if (age <= 3) score += 16;
  else if (age <= 8) score += 10;
  else if (age <= 15) score += 4;
  else score -= 6;
  if (q === "Good") score += 18;
  else if (q === "Weak") score += 4;
  score = Math.max(18, Math.min(96, score));
  let now = "Registry match only — no timing fact";
  if (age != null && age <= 1) now = "Newly registered — early-stage (" + y + ")";
  else if (age != null && age <= 3) now = "Young company — early-stage (" + y + ")";
  else if (q === "Good" && staff >= 2 && staff <= 12) now = "Small team — reachable (" + staff + ")";
  else if (q === "Good") now = "Official email — reachable";
  else if (q === "Weak") now = "Shared inbox — review before send";
  else if (staff >= 2 && staff <= 12) now = "Small team — no official email";
  return { score, now };
}

function loadJsonSafe(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function DashboardHome({ markets, lastQ, homeQ, setHomeQ, pickCity, createFirstMarket, runHomeSearch, openLeads }) {
  const [focusQ, setFocusQ] = useState("Oslo, programvare");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const statusMap = loadJsonSafe("relista_status", {});
  const saved = loadJsonSafe("relista_saved", {});

  useEffect(() => {
    let live = true;
    const q = focusQ || "Oslo, programvare";
    fetch(`${API}/search?q=${encodeURIComponent(q)}&page=0&size=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!live) return;
        const items = data.items || data.leads || [];
        setRows(items);
        setTotal(Number(data.total ?? items.length));
      })
      .catch(() => {
        if (!live) return;
        setRows([]);
        setTotal(0);
      });
    return () => {
      live = false;
    };
  }, [focusQ]);

  const ready = Object.values(statusMap).filter((s) => s === "Ready to contact").length;
  const market = markets.find((m) => String(m.q).toLowerCase() === String(focusQ).toLowerCase());
  const seen = market?.seen || loadJsonSafe(`relista_seen_${String(focusQ).toLowerCase()}`, []);
  const newCount = seen.length ? rows.filter((r) => r.orgnr && !seen.includes(r.orgnr)).length : 0;
  const scored = rows.map((r) => ({ ...r, fit: dashFit(r), quality: dashEmailQuality(r), status: statusMap[r.orgnr] === "New" || !statusMap[r.orgnr] ? "Not reviewed" : statusMap[r.orgnr] }));
  const ranked = [...scored].filter((r) => !isShellCompany(r)).sort((a, b) => b.fit - a.fit);
  const queue = ranked.slice(0, 15);
  const reachable = queue.filter((r) => r.quality === "Good");
  const topFitCount = reachable.length;
  const pipe = {
    New: Object.values(statusMap).filter((s) => s === "New").length || scored.filter((r) => r.status === "New").length,
    Researching: Object.values(statusMap).filter((s) => s === "Researching").length,
    Ready: ready,
    Contacted: Object.values(statusMap).filter((s) => s === "Contacted").length,
  };

  return (
    <div className="h-full overflow-auto px-8 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">This week's work pack</h1>
            <select
              value={focusQ}
              onChange={(e) => setFocusQ(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {CITIES.map((c) => (
                <option key={c.q} value={c.q}>{c.label}</option>
              ))}
              {markets.filter((m) => !CITIES.some((c) => c.q.toLowerCase() === String(m.q).toLowerCase())).map((m) => (
                <option key={m.id || m.q} value={m.q}>{String(m.city || m.q).split(",")[0]}</option>
              ))}
            </select>
          </div>
          <span className="text-xs font-medium text-white bg-blue-600 px-3 py-1.5 rounded-full shadow-[0_0_16px_rgba(37,99,235,0.55)]">
            Enhetsregisteret
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-2 max-w-3xl">
          A weekly work pack for Norwegian B2B teams. It helps them find official companies worth reviewing, understand why each company matches, and prepare a first outreach draft they edit and send themselves.
        </p>
        <p className="text-xs text-gray-500 mb-4">Market → Weekly work pack → Review evidence → Draft email → Human sends → Record outcome</p>
        <form onSubmit={runHomeSearch} className="flex gap-2 mb-2">
          <input value={homeQ} onChange={(e) => setHomeQ(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))} placeholder="Oslo, programvare" className="flex-1 px-4 py-2 rounded-xl bg-white text-black outline-none" />
          <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-sm">Find registered companies</button>
        </form>
        <p className="text-xs text-gray-500 mb-6">Each row is an AS retrieved from Brreg that matches the current saved market rules. Official Enhetsregisteret. No invented emails.</p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <button type="button" onClick={() => openLeads(focusQ, "ready")} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex justify-between text-xs text-gray-400 mb-2"><span>Ready to contact</span><span className="text-green-400">↗</span></div>
            <div className="text-3xl font-semibold">{ready}</div>
          </button>
          <button type="button" onClick={() => openLeads(focusQ, "new")} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex justify-between text-xs text-gray-400 mb-2"><span>New since last market check</span><span className="text-blue-300">✦</span></div>
            <div className="text-3xl font-semibold">{newCount} <span className="text-sm text-gray-400">in this market</span></div>
          </button>
          <button type="button" onClick={() => openLeads(focusQ, "high")} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex justify-between text-xs text-gray-400 mb-2"><span>Reachable now</span><span className="text-blue-200">◎</span></div>
            <div className="text-3xl font-semibold">{topFitCount} <span className="text-sm text-gray-400">in this pack</span></div>
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-lg text-white mb-2">
              {queue.length} companies in this week's work pack
            </p>
            <p className="text-sm text-gray-400 mb-4">
              {newCount === 0 ? "No organisations are new since the last saved snapshot. The pack still contains companies worth reviewing." : `${newCount} new since last market check.`} {ready} ready to contact. Human send only.
            </p>
            <p className="text-xs text-gray-500 mb-4">New since last check means this organisation matches the saved market now but was not in the previous saved-market snapshot.</p>
            <div className="flex flex-wrap gap-2">
              {ready > 0 ? (
                <button type="button" onClick={() => openLeads(focusQ, "ready")} className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm">
                  Work ready ({ready})
                </button>
              ) : (
                <button type="button" onClick={() => openLeads(focusQ, "high")} className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm">
                  Review reachable
                </button>
              )}
              <button type="button" onClick={() => openLeads(focusQ, "new")} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm">See new companies</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Market pulse</div>
            <div className="font-medium mb-1">{String(market?.city || focusQ).split(",")[0]}</div>
            <div className="text-2xl font-semibold">{total || market?.total || rows.length} matching companies</div>
            <div className="text-sm text-green-400 mt-1">{newCount} new since last check</div>
            {!markets.length && (
              <button type="button" onClick={createFirstMarket} className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 text-sm">
                Save this market
              </button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <div className="text-sm text-gray-400 mb-2">This week's work pack · {queue.length} companies</div>
          <div className="space-y-2">
            {queue.map((r) => (
              <div key={r.orgnr} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.company}</div>
                  <div className="text-xs text-gray-400">{dashFitReason(r)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => openLeads(focusQ, "all", r.orgnr)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm shrink-0"
                >
                  {r.quality === "None" ? "Review company" : "Draft email"}
                </button>
              </div>
            ))}
            {!queue.length && <p className="text-sm text-gray-500">Search a market to fill this queue.</p>}
          </div>
        </div>

        <div className="mb-8">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
            <div className="bg-blue-500" style={{ width: `${Math.max(8, pipe.New * 8)}%` }} />
            <div className="bg-white/30" style={{ width: `${Math.max(8, pipe.Researching * 8)}%` }} />
            <div className="bg-green-500" style={{ width: `${Math.max(8, pipe.Ready * 8)}%` }} />
            <div className="bg-white/20" style={{ width: `${Math.max(8, pipe.Contacted * 8)}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-gray-400 mt-2">
            {Object.entries(pipe).map(([k, v]) => (
              <div key={k}>
                <div className="text-white text-sm">{v}</div>
                {k}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function capFirst(text) {
  const t = String(text || "");
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function proseOnly(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadSavedChats() {
  try {
    return JSON.parse(localStorage.getItem("relista_chats") || "[]");
  } catch {
    return [];
  }
}

function chatTitle(item) {
  const first = (item?.messages || []).find((m) => m.sender === "user");
  const t = String(first?.text || "Saved chat").replace(/\s+/g, " ").trim();
  return t.length > 72 ? `${t.slice(0, 72)}...` : t;
}

function chatWhen(item) {
  if (!item?.at) return "";
  try {
    return new Date(item.at).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-11 h-11">
      <rect width="40" height="40" rx="10" fill="#2563eb" />
      <path d="M11 13h18M11 20h12M11 27h15" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="29" cy="20" r="2.2" fill="white" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-8.49 8.49a5.25 5.25 0 01-7.42-7.42l8.48-8.49a3.5 3.5 0 014.95 4.95l-8.48 8.48a1.75 1.75 0 01-2.48-2.47l7.78-7.78" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 012-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v10H4V10h3zm3 10h7.5a2 2 0 001.95-1.55l1.3-5.2A1.5 1.5 0 0019.3 11H14V6a2 2 0 00-2-2h-.4L8 10v10h2z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14V4h3v10h-3zm-3-10H6.5A2 2 0 004.55 5.55l-1.3 5.2A1.5 1.5 0 004.7 13H10v5a2 2 0 002 2h.4L16 14V4h-2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M8 7l4-4 4 4" />
      <path strokeLinecap="round" d="M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
    </svg>
  );
}

function SpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
      <path strokeLinecap="round" d="M16 9a4 4 0 010 6M19 7a7 7 0 010 10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 9A8 8 0 006 6.5M3.5 15A8 8 0 0018 17.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function HomeIcon() {
  return <NavIcon d="M4 11l8-7 8 7v8a2 2 0 01-2 2h-4v-6H10v6H6a2 2 0 01-2-2v-8z" />;
}

function ListIcon() {
  return <NavIcon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />;
}

function FileIcon() {
  return <NavIcon d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5" />;
}

function ChatIcon() {
  return <NavIcon d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h4a8 8 0 018 5z" />;
}

function GearIcon() {
  return <NavIcon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.2a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 010 4h-.2a1.7 1.7 0 00-1.4 1z" />;
}

function PlusIcon() {
  return <NavIcon d="M12 5v14M5 12h14" />;
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.2 8.2l1.6 1.6-5.7 5.7H8.5v-1.6l5.7-5.7z" />
    </svg>
  );
}

function AskMark() {
  return (
    <div className="relative mx-auto mb-5 w-12 h-12">
      <div className="absolute inset-0 rounded-full bg-blue-600/30 blur-md" />
      <div className="relative w-12 h-12 rounded-xl bg-[#0E1628] border border-white/15 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h8M4 6l.01 0M4 12l.01 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 16l2 2 4-4" />
        </svg>
      </div>
    </div>
  );
}

function childText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childText).join("");
  if (node.props?.children) return childText(node.props.children);
  return "";
}

function isScript(text) {
  const t = text || "";
  return /```/.test(t) || /^#!/m.test(t) || /\b(sudo|def |function |import |const |let |var |class |apt |npm |pip )\b/.test(t);
}

function CodeBlock({ children, ...props }) {
  const [done, setDone] = useState(false);
  const text = childText(children);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className="relative my-2">
      <button type="button" onClick={copy} className="absolute top-2 right-2 p-1.5 rounded bg-black/50 text-gray-200 hover:bg-black/70" title={done ? "Copied" : "Copy code"}>
        {done ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre {...props} className="overflow-auto pr-10 text-sm">{children}</pre>
    </div>
  );
}

function Composer({ onSend, onUpload, loading, onStop }) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2 py-4 items-center">
      <label className="p-3 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer text-gray-300" title="Upload file">
        <ClipIcon />
        <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; onUpload(file); }} />
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (loading) return;
            const v = text.trim();
            if (!v) return;
            setText("");
            onSend(v);
          }
        }}
        className="flex-1 px-5 py-4 rounded-2xl bg-white text-black outline-none"
        placeholder="Ask about an uploaded document or a quick research task..."
      />
      {loading ? (
        <button type="button" onClick={onStop} className="bg-white/15 hover:bg-white/25 px-6 py-3 rounded-xl">Stop</button>
      ) : (
        <button type="button" onClick={() => { const v = text.trim(); if (!v) return; setText(""); onSend(v); }} className="bg-[#1E3A8A] hover:bg-[#1D4ED8] px-6 py-3 rounded-xl">Send</button>
      )}
    </div>
  );
}

function SettingsPage() {
  const [note, setNote] = useState("");
  const exportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      last_search: localStorage.getItem("leadflow_q") || "",
      markets: JSON.parse(localStorage.getItem("relista_markets") || "[]"),
      saved: JSON.parse(localStorage.getItem("relista_saved") || "{}"),
      status: JSON.parse(localStorage.getItem("relista_status") || "{}"),
      feedback: JSON.parse(localStorage.getItem("relista_feedback") || "[]"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relista-data.json";
    a.click();
    setNote("Downloaded relista-data.json");
  };
  return (
    <div className="flex-1 p-10 text-white">
      <h2 className="text-2xl font-semibold mb-3">Settings</h2>
      <p className="text-gray-400 max-w-xl leading-relaxed mb-8">
        Saved markets, stars, and statuses stay in this browser. Export them before you clear the cache.
      </p>
      <div className="max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 mb-8">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Team</div>
        <div className="text-2xl font-semibold mb-1">999 NOK / month</div>
        <p className="text-sm text-gray-400 mb-4">
          Shared market lists for a small Norwegian B2B team. Payment is not live yet. Price is the planned Team tier.
        </p>
        <p className="text-xs text-gray-500">Founder testing stays free until billing is on.</p>
      </div>
      <button type="button" onClick={exportData} className="px-4 py-2 rounded-lg bg-blue-600 text-sm">
        Export my data
      </button>
      {note && <p className="text-sm text-gray-400 mt-3">{note}</p>}
    </div>
  );
}

async function sendFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
  return res.json().catch(() => ({}));
}

function UploadsPage() {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`${API}/uploads`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setNote("Could not load files.");
    }
  };

  const uploadDoc = async (file) => {
    if (!file) return;
    setNote("Uploading...");
    try {
      await sendFile(file);
      setNote("Saved");
      load();
    } catch {
      setNote("Upload failed");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex-1 p-10 text-white overflow-auto">
      <h2 className="text-2xl font-semibold mb-2">Uploads</h2>
      <p className="text-gray-400 mb-6 max-w-xl">Files stay here for Ask. Draft on Leads uses only the offer one-pager.</p>
      <label className="block max-w-xl rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-8 mb-6 cursor-pointer hover:bg-white/10">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-white/10 inline-flex items-center justify-center">
            <ClipIcon />
          </span>
          <div>
            <div className="text-sm font-medium">Upload a PDF or Word file</div>
            <div className="text-xs text-gray-400 mt-1">Click to choose a document</div>
          </div>
        </div>
        <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; uploadDoc(file); }} />
      </label>
      {note && <p className="text-sm text-gray-500 mb-4">{note}</p>}
      <ul className="space-y-2 max-w-xl">
        {files.map((f) => (
          <li key={f.filename} className="border border-white/10 rounded-xl px-4 py-3 bg-white/5">
            <a href={`${API}/uploads/${encodeURIComponent(f.filename)}`} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline">{f.filename}</a>
            <div className="text-xs text-gray-500">{f.bytes} bytes</div>
          </li>
        ))}
        {!files.length && <li className="text-gray-500 text-sm">No files yet.</li>}
      </ul>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("relista_chat") || "[]");
    } catch {
      return [];
    }
  });
  const [page, setPage] = useState("dashboard");
  const [homeQ, setHomeQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");
  const [voteMsg, setVoteMsg] = useState({});
  const [speaking, setSpeaking] = useState(false);
  const [moreOpen, setMoreOpen] = useState(null);
  const [lastQ, setLastQ] = useState(() => localStorage.getItem("leadflow_q") || "");
  const [savedChats, setSavedChats] = useState(() => loadSavedChats());
  const [markets, setMarkets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("relista_markets") || "[]");
    } catch {
      return [];
    }
  });
  const [savedLeadCount, setSavedLeadCount] = useState(() => {
    try {
      return Object.keys(JSON.parse(localStorage.getItem("relista_saved") || "{}")).length;
    } catch {
      return 0;
    }
  });
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("relista_chat", JSON.stringify(messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const load = () => window.speechSynthesis?.getVoices?.();
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  const copyAll = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  };

  const rateMessage = (index, outcome, body) => {
    setVoteMsg((prev) => ({ ...prev, [index]: outcome }));
    try {
      const prev = JSON.parse(localStorage.getItem("relista_ask_feedback") || "[]");
      prev.unshift({ at: Date.now(), outcome, text: (body || "").slice(0, 500) });
      localStorage.setItem("relista_ask_feedback", JSON.stringify(prev.slice(0, 50)));
    } catch {
      /* ignore */
    }
  };

  const shareMessage = async (body, key) => {
    const payload = body || "";
    try {
      if (navigator.share) await navigator.share({ text: payload });
      else await navigator.clipboard.writeText(payload);
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      try {
        await navigator.clipboard.writeText(payload);
        setCopied(key);
        setTimeout(() => setCopied(""), 1600);
      } catch {
        /* ignore */
      }
    }
  };

  const speakText = (text) => {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking || speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      const score = (v) => {
        const n = `${v.name} ${v.lang}`.toLowerCase();
        if (/zarvox|whisper|bad news|good news|bells|boing|bubbles|cellos|organ|trinoids|albert|bahh|novelty|pipe organ|junior|princess|ralph|fred|kathy|bruce/.test(n)) return -100;
        let s = 0;
        if (/premium|enhanced|neural|natural|siri|ava|samantha|daniel|karen|moira|tessa|fiona|serena|susan|allison|tom|aaron|nicky|evan/.test(n)) s += 12;
        if (/google/.test(n) && /english/.test(n)) s += 8;
        if (/en-gb|en_gb/.test(n)) s += 6;
        if (/en-us|en_us/.test(n)) s += 5;
        if (/^en/.test(v.lang)) s += 3;
        if (v.localService) s += 1;
        return s;
      };
      return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
    };
    const start = () => {
      const u = new SpeechSynthesisUtterance(proseOnly(text));
      const voice = pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || "en-GB";
      } else {
        u.lang = "en-GB";
      }
      u.rate = 0.98;
      u.pitch = 1;
      u.volume = 1;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    if (!(window.speechSynthesis.getVoices() || []).length) {
      window.speechSynthesis.addEventListener("voiceschanged", start, { once: true });
      window.speechSynthesis.getVoices();
      return;
    }
    start();
  };

  const regenerate = (index) => {
    const prev = [...messages].slice(0, index).reverse().find((m) => m.sender === "user");
    if (prev?.text) sendMessage(prev.text);
  };

  const goHome = () => {
    setLastQ(localStorage.getItem("leadflow_q") || "");
    try {
      setMarkets(JSON.parse(localStorage.getItem("relista_markets") || "[]"));
    } catch {
      setMarkets([]);
    }
    try {
      setSavedLeadCount(Object.keys(JSON.parse(localStorage.getItem("relista_saved") || "{}")).length);
    } catch {
      setSavedLeadCount(0);
    }
    setPage("dashboard");
  };

  const newChat = () => {
    if (messages.length) {
      try {
        const saved = loadSavedChats();
        saved.unshift({ at: Date.now(), messages });
        const next = saved.slice(0, 10);
        localStorage.setItem("relista_chats", JSON.stringify(next));
        setSavedChats(next);
      } catch {
        /* ignore */
      }
    }
    window.speechSynthesis?.cancel?.();
    abortRef.current?.abort();
    setSpeaking(false);
    setLoading(false);
    setMessages([]);
    localStorage.removeItem("relista_chat");
    setPage("chat");
  };

  const clearSavedChats = () => {
    localStorage.removeItem("relista_chats");
    setSavedChats([]);
  };

  const openSavedChat = (item) => {
    const thread = Array.isArray(item?.messages) ? item.messages : [];
    if (!thread.length) return;
    if (messages.length) {
      try {
        const saved = loadSavedChats();
        saved.unshift({ at: Date.now(), messages });
        const next = saved.slice(0, 10);
        localStorage.setItem("relista_chats", JSON.stringify(next));
        setSavedChats(next);
      } catch {
        /* ignore */
      }
    }
    window.speechSynthesis?.cancel?.();
    abortRef.current?.abort();
    setSpeaking(false);
    setLoading(false);
    setMessages(thread);
    setPage("chat");
  };

  const pickCity = (q) => {
    localStorage.setItem("leadflow_q", q);
    localStorage.setItem("leadflow_run", "1");
    setLastQ(q);
    setPage("leads");
  };

  const createFirstMarket = () => {
    const q = "Oslo, programvare";
    const row = {
      id: "oslo-programvare",
      name: "Oslo software companies",
      q,
      city: "Oslo",
      sector: "programvare",
      seen: [],
      total: 0,
      lastAt: Date.now(),
    };
    let next = [];
    try {
      next = JSON.parse(localStorage.getItem("relista_markets") || "[]");
    } catch {
      next = [];
    }
    if (!next.some((m) => m.id === row.id || String(m.q).toLowerCase() === q)) {
      next = [row, ...next].slice(0, 8);
      localStorage.setItem("relista_markets", JSON.stringify(next));
    }
    localStorage.setItem("relista_market", row.id);
    setMarkets(next.length ? next : [row]);
    pickCity(q);
  };

  const runHomeSearch = (e) => {
    e?.preventDefault();
    const q = homeQ.trim();
    if (!q) return;
    pickCity(q);
  };

  const stopReply = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const sendMessage = async (preset) => {
    const messageToSend = capFirst((typeof preset === "string" ? preset : "").trim());
    if (!messageToSend) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const history = messages.map((m) => ({ sender: m.sender, text: m.text }));
    setPage("chat");
    setMessages((prev) => [...prev, { sender: "user", text: messageToSend }]);
    setLoading(true);
    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageToSend, history }),
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botText = "";
      setMessages((prev) => [...prev, { sender: "bot", text: "" }]);
      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (let i = 0; i < chunk.length; i += 2) {
          if (controller.signal.aborted) break;
          botText += chunk.slice(i, i + 2);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { sender: "bot", text: botText };
            return updated;
          });
          await new Promise((res) => setTimeout(res, 16));
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setMessages((prev) => [...prev, { sender: "bot", text: "Request failed." }]);
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const uploadDoc = async (file, fromAsk = false) => {
    if (!file) return;
    try {
      await sendFile(file);
      if (fromAsk) await sendMessage(`Summarise ${file.name}`);
    } catch {
      /* ignore */
    }
  };

  const tabClass = (id) =>
    `w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 ${page === id ? "bg-white/10 text-white" : "text-gray-300"}`;

  return (
    <div className="relative flex h-screen bg-[#070B16] text-white overflow-hidden">
      <div className="relative z-10 w-72 bg-black/40 border-r border-white/10 p-4 flex flex-col">
        <button type="button" onClick={goHome} className="mb-8 flex items-center gap-3 text-left focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-lg">
          <LogoMark />
          <div>
            <h1 className="font-semibold text-lg leading-tight">Relista</h1>
            <p className="text-gray-400 text-xs">Weekly work packs</p>
          </div>
        </button>
        <div className="space-y-1">
          <button type="button" onClick={goHome} className={tabClass("dashboard")}><HomeIcon /> Dashboard</button>
          <button type="button" onClick={() => setPage("leads")} className={tabClass("leads")}><ListIcon /> Leads</button>
          <button type="button" onClick={() => setPage("uploads")} className={tabClass("uploads")}><FileIcon /> Uploads</button>
          <button type="button" onClick={() => setPage("chat")} className={tabClass("chat")}><ChatIcon /> Ask</button>
          <button type="button" onClick={() => setPage("settings")} className={tabClass("settings")}><GearIcon /> Settings</button>
        </div>
      </div>
      <div className="relative z-10 flex-1 min-w-0 h-full min-h-0 overflow-hidden flex flex-col">
        {page === "leads" ? (
          <LeadsPage />
        ) : page === "uploads" ? (
          <UploadsPage />
        ) : page === "settings" ? (
          <SettingsPage />
        ) : page === "chat" ? (
          <div className="h-full flex flex-col px-6">
            <div className="shrink-0 flex justify-end gap-3 py-4 border-b border-white/10">
              <button type="button" onClick={goHome} title="Home" className="h-9 px-3 rounded-lg text-sm text-gray-200 bg-transparent border border-white/15 hover:bg-white/10 inline-flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <HomeIcon /> Home
              </button>
              <button type="button" onClick={newChat} title="New chat" className="h-9 w-9 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] inline-flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-blue-400">
                <NewChatIcon />
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-4 pt-6">
              {!messages.length && (
                <div className="mt-14 max-w-3xl mx-auto text-center">
                  <AskMark />
                  <h2 className="text-[30px] leading-tight font-semibold text-white mb-2">Ask Relista</h2>
                  <p className="text-gray-400 mb-8">Documents and quick research only. Company search stays in Leads.</p>
                  <div className="grid grid-cols-3 gap-3 text-left">
                    <button type="button" onClick={() => sendMessage("Summarise the latest uploaded document into key points.")} className="h-full min-h-[104px] rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <div className="text-sm font-medium mb-1">Summarise a document</div>
                      <div className="text-xs text-gray-400">Key points from an uploaded file.</div>
                    </button>
                    <button type="button" onClick={() => sendMessage("Extract a business brief from the latest uploaded document, including facts and follow-up questions.")} className="h-full min-h-[104px] rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <div className="text-sm font-medium mb-1">Build a business brief</div>
                      <div className="text-xs text-gray-400">Facts and follow-up questions from a file.</div>
                    </button>
                    <button type="button" onClick={() => sendMessage("What is the current time and weather in Oslo?")} className="h-full min-h-[104px] rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <div className="text-sm font-medium mb-1">Check a location detail</div>
                      <div className="text-xs text-gray-400">A quick time or weather check for planning.</div>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-6">Lead search, company review, and email drafts live in Leads.</p>
                  {!!savedChats.length && (
                    <div className="mt-8 text-left">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Recent chats</p>
                        <button type="button" onClick={clearSavedChats} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
                      </div>
                      <div className="space-y-2">
                        {savedChats.slice(0, 6).map((item, idx) => (
                          <button
                            key={`${item.at || "chat"}-${idx}`}
                            type="button"
                            onClick={() => openSavedChat(item)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 text-left"
                          >
                            <div className="text-sm text-white truncate">{chatTitle(item)}</div>
                            <div className="text-xs text-gray-500 mt-1">{chatWhen(item)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[70%] px-5 py-3 rounded-2xl ${msg.sender === "user" ? "bg-[#15233D] border border-white/15 text-white" : "bg-[#121A2B] border border-white/10 text-gray-100"}`}>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown components={{ pre: CodeBlock }}>
                        {loading && i === messages.length - 1 && msg.sender === "bot" ? `${msg.text}▍` : msg.text}
                      </ReactMarkdown>
                    </div>
                    {msg.sender === "bot" && msg.text && !(loading && i === messages.length - 1) && (
                      <div className="relative flex items-center gap-1 mt-3 pt-2 text-gray-400">
                        <button type="button" onClick={() => copyAll(proseOnly(msg.text), `copy-${i}`)} className="p-1.5 rounded hover:bg-white/10" title="Copy">
                          {copied === `copy-${i}` ? <CheckIcon /> : <CopyIcon />}
                        </button>
                        <button type="button" onClick={() => speakText(msg.text)} className={`p-1.5 rounded hover:bg-white/10 ${speaking ? "text-blue-300" : ""}`} title="Read aloud">
                          <SpeakIcon />
                        </button>
                        <button type="button" onClick={() => regenerate(i)} className="p-1.5 rounded hover:bg-white/10" title="Regenerate">
                          <RefreshIcon />
                        </button>
                        <button type="button" onClick={() => setMoreOpen(moreOpen === i ? null : i)} className="p-1.5 rounded hover:bg-white/10" title="More">
                          <MoreIcon />
                        </button>
                        {moreOpen === i && (
                          <div className="absolute left-28 bottom-8 bg-[#0E1628] border border-white/10 rounded-lg p-1 flex gap-1">
                            <button type="button" onClick={() => { rateMessage(i, "up", msg.text); setMoreOpen(null); }} className="p-1.5 rounded hover:bg-white/10" title="Like"><ThumbUpIcon /></button>
                            <button type="button" onClick={() => { rateMessage(i, "down", msg.text); setMoreOpen(null); }} className="p-1.5 rounded hover:bg-white/10" title="Dislike"><ThumbDownIcon /></button>
                            <button type="button" onClick={() => { shareMessage(proseOnly(msg.text), `share-${i}`); setMoreOpen(null); }} className="p-1.5 rounded hover:bg-white/10" title="Share"><ShareIcon /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <Composer onSend={sendMessage} onUpload={(file) => uploadDoc(file, true)} loading={loading} onStop={stopReply} />
          </div>
        ) : (
          <DashboardHome
            markets={markets}
            lastQ={lastQ}
            homeQ={homeQ}
            setHomeQ={setHomeQ}
            pickCity={pickCity}
            createFirstMarket={createFirstMarket}
            runHomeSearch={runHomeSearch}
            openLeads={(q, view, orgnr) => {
              localStorage.setItem("leadflow_q", q);
              localStorage.setItem("leadflow_run", "1");
              localStorage.setItem("relista_dash_view", view || "all");
              if (orgnr) localStorage.setItem("relista_open_orgnr", orgnr);
              setLastQ(q);
              setPage("leads");
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
