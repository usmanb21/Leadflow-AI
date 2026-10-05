import React, { useEffect, useMemo, useState } from "react";

const API = "http://127.0.0.1:8000";

const CITIES = [
  { label: "Oslo", q: "Oslo, programvare" },
  { label: "Bergen", q: "Bergen, programvare" },
  { label: "Trondheim", q: "Trondheim, programvare" },
  { label: "Stavanger", q: "Stavanger, programvare" },
  { label: "Kristiansand", q: "Kristiansand, programvare" },
];

const NACE_EN = {
  "58.29": "Other software publishing",
  "58.290": "Other software publishing",
  "62.01": "Computer programming",
  "62.010": "Computer programming",
  "62.02": "IT consultancy",
  "62.03": "IT facilities management",
  "62.09": "Other IT services",
  "62.090": "Other IT services",
  "63.11": "Data processing / hosting",
  "63.12": "Web portals",
};

const NACE_FRIENDLY = {
  "58.29": "Software publishing",
  "58.290": "Software publishing",
  "62.01": "Software development",
  "62.010": "Software development",
  "62.02": "IT consultancy",
  "62.03": "IT operations",
  "62.09": "IT services",
  "62.090": "IT services",
  "63.11": "Hosting / data processing",
  "63.12": "Web portals",
};

const EMPTY_OFFER = {
  who: "Norwegian B2B SaaS teams",
  problem: "They spend too much time finding relevant companies manually",
  outcome: "They build a verified prospect list faster",
  why: "Norwegian B2B SaaS teams often need a repeatable way to find relevant companies for outreach without spending hours on manual research",
  cta: "Offer a short walkthrough of a city and sector list",
  lang: "English",
};

const PACK_SIZE = 15;
const NEEDS = ["Too generic", "Wrong company", "Wrong offer", "Too long", "Not sendable"];

function isShellCompany(lead) {
  const name = String(lead?.company || lead?.navn || "").toUpperCase();
  return /\b(HOLDCO|MIDCO|NEWCO|HOLDING|INVEST|INVESTMENT|EIENDOM|PROPERTY)\b/.test(name);
}
const STATUSES = ["Not reviewed", "Researching", "Ready to contact", "Contacted", "Skip"];
const OUTCOMES = ["Not recorded", "Sent", "Replied", "Meeting", "Not a fit"];

function loadJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "");
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

function naceOfficial(lead) {
  const code = String(lead.nace || "");
  return NACE_EN[code] || lead.nace_text || code || "-";
}

function naceLabel(lead) {
  const code = String(lead.nace || "");
  return NACE_FRIENDLY[code] || naceOfficial(lead);
}

function naceVerify(lead) {
  const code = String(lead.nace || "-");
  return `NACE ${code} | ${naceOfficial(lead)}`;
}

function yearOf(lead) {
  return String(lead.founded || "").slice(0, 4);
}

function brregLink(lead) {
  return lead.brreg_url || `https://data.brreg.no/enhetsregisteret/oppslag/enheter/${lead.orgnr}`;
}

function emailStatus(lead) {
  return lead.email ? lead.email : "No official email published";
}

function emailQuality(lead) {
  const raw = String(lead.email || "").trim().toLowerCase();
  if (!raw) return "None";
  const local = raw.split("@")[0] || "";
  if (/^(post|firmapost|postmottak|mail|info|kontakt|contact|office|hello|hi|support|admin)$/.test(local)) {
    return "Weak";
  }
  return "Good";
}

function leadStatus(map, orgnr) {
  const v = map?.[orgnr];
  if (!v || v === "New") return "Not reviewed";
  return v;
}

function outcomeRecord(map, orgnr) {
  const v = map?.[orgnr];
  if (!v || v === "—" || v === "Not recorded") return { value: "Not recorded", at: "" };
  if (typeof v === "string") return { value: v, at: "" };
  return { value: v.value || "Not recorded", at: v.at || "" };
}

function formatOutcomeDate(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function outcomeLabel(map, orgnr) {
  const rec = outcomeRecord(map, orgnr);
  if (rec.value === "Not recorded" || !rec.at) return rec.value;
  return `${rec.value} · ${formatOutcomeDate(rec.at)}`;
}

function emailNotice(lead) {
  const q = emailQuality(lead);
  if (q === "None") return "No official email published. Relista does not invent or guess contacts.";
  if (q === "Weak") return "Shared company inbox. This address is published for the company, not a named contact. Draft only — review the recipient and message before sending.";
  return "Published work email. Review the recipient and message before sending.";
}

function inclusionLine(lead, isNew) {
  const q = emailQuality(lead);
  const staff = Number(lead.employees || 0);
  const bits = [naceLabel(lead), lead.city ? `${lead.city} registered address` : "registered address"];
  if (staff >= 2 && staff <= 25) bits.push("Small team");
  else if (staff) bits.push(`${staff} staff`);
  if (q === "Good") bits.push("Official email published");
  else if (q === "Weak") bits.push("Shared company inbox");
  else bits.push("No official email published");
  if (recentFounded(lead)) bits.push("Recently registered");
  if (isNew) bits.push("New since last market check");
  if (q === "None" && !recentFounded(lead) && !isNew) {
    return { label: "Why review", text: "Registry match only · No official email published · No timing signal" };
  }
  return { label: "Why included", text: bits.join(" · ") };
}

function fitScore(lead) {
  return fitDetail(lead).score;
}

function fitReason(lead) {
  return fitDetail(lead).now;
}

function fitWhy(lead) {
  return fitDetail(lead).why;
}

function fitDetail(lead) {
  const staff = Number(lead.employees || 0);
  const y = Number(String(lead.founded || "").slice(0, 4) || 0);
  const age = y ? new Date().getFullYear() - y : null;
  const q = emailQuality(lead);
  let score = 38;
  let sizeNote = "staff not published";
  if (staff >= 2 && staff <= 12) {
    score += 24;
    sizeNote = staff + " staff";
  } else if (staff >= 13 && staff <= 25) {
    score += 16;
    sizeNote = staff + " staff";
  } else if (staff >= 26 && staff <= 40) {
    score += 8;
    sizeNote = staff + " staff";
  } else if (staff >= 41 && staff <= 80) {
    score += 1;
    sizeNote = staff + " staff — above typical size";
  } else if (staff > 80) {
    score -= 10;
    sizeNote = staff + " staff — above typical size";
  }
  if (age == null) {
    /* no year */
  } else if (age <= 3) score += 16;
  else if (age <= 8) score += 10;
  else if (age <= 15) score += 4;
  else score -= 6;
  let emailNote = "no official email published";
  if (q === "Good") {
    score += 18;
    emailNote = "official email published";
  } else if (q === "Weak") {
    score += 4;
    emailNote = "shared inbox published";
  }
  score = Math.max(18, Math.min(96, score));
  let now = "Registry match only — no timing fact";
  if (age != null && age <= 1) now = "Newly registered — early-stage (" + y + ")";
  else if (age != null && age <= 3) now = "Young company — early-stage (" + y + ")";
  else if (q === "Good" && staff >= 2 && staff <= 12) now = "Small team — reachable (" + staff + ")";
  else if (q === "Good") now = "Official email — reachable";
  else if (q === "Weak") now = "Shared inbox — review before send";
  else if (staff >= 2 && staff <= 12) now = "Small team — no official email";
  const bits = [sizeNote, y ? "founded " + y : "founded year unknown", emailNote];
  return { score: score, now: now, why: bits.join(" · "), reason: now };
}

function formatOffer(o) {
  return [
    `Who: ${o.who}`,
    `Problem: ${o.problem}`,
    `Outcome: ${o.outcome}`,
    `Why: ${o.why}`,
    `CTA: ${o.cta}`,
    `Language: ${o.lang}`,
  ].join("\n");
}

function parseOffer(text) {
  const o = { ...EMPTY_OFFER };
  if (!text) return o;
  const lines = String(text).split("\n");
  const map = { who: "who", problem: "problem", outcome: "outcome", why: "why", cta: "cta", language: "lang" };
  let matched = false;
  for (const line of lines) {
    const m = line.match(/^(Who|Problem|Outcome|Why|CTA|Language)\s*:\s*(.*)$/i);
    if (m) {
      matched = true;
      o[map[m[1].toLowerCase()]] = m[2].trim();
    }
  }
  if (!matched && text.trim()) o.why = text.trim();
  return o;
}

function factsText(lead) {
  return [
    lead.company,
    `Org.nr ${lead.orgnr}`,
    `City ${lead.city || "-"}`,
    `Founded ${lead.founded || "-"}`,
    `Employees ${lead.employees ?? "-"}`,
    `Sector ${naceLabel(lead)}`,
    `Purpose ${lead.purpose || "-"}`,
    `Contact ${emailStatus(lead)}`,
    brregLink(lead),
  ].join("\n");
}

function formatPurpose(text) {
  if (!text) return "-";
  return String(text)
    .replace(/,([^\s])/g, ", $1")
    .replace(/\bog(?=[A-Za-zÆØÅæøå])/gi, "og ")
    .replace(/\s+/g, " ")
    .trim();
}

function marketTitle(city, sector) {
  const c = city || "Oslo";
  const s = String(sector || "programvare");
  const pretty = s.toLowerCase().startsWith("program") ? "software companies" : `${s} companies`;
  return `${c} ${pretty}`;
}

function recentFounded(lead) {
  const y = Number(yearOf(lead) || 0);
  const now = new Date().getFullYear();
  return y && now - y <= 1;
}

export default function LeadsPage() {
  const [q, setQ] = useState(() => localStorage.getItem("leadflow_q") || "Oslo, programvare");
  const [leads, setLeads] = useState([]);
  const [offer, setOffer] = useState(EMPTY_OFFER);
  const [open, setOpen] = useState(null);
  const [modell, setModell] = useState("");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState("");
  const [searchError, setSearchError] = useState("");
  const [retrievedAt, setRetrievedAt] = useState("");
  const [searchMeta, setSearchMeta] = useState({ city: "Oslo", sector: "programvare", total: 0 });
  const [page, setPage] = useState(0);
  const [minStaff, setMinStaff] = useState("");
  const [afterYear, setAfterYear] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [sortBy, setSortBy] = useState("fit");
  const [view, setView] = useState("all");
  const [listMode, setListMode] = useState("pack");
  const [showFilters, setShowFilters] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [copied, setCopied] = useState("");
  const [vote, setVote] = useState("");
  const [voteReason, setVoteReason] = useState("");
  const [comment, setComment] = useState("");
  const [newIds, setNewIds] = useState([]);
  const [saved, setSaved] = useState(() => loadJson("relista_saved", {}));
  const [statusMap, setStatusMap] = useState(() => loadJson("relista_status", {}));
  const [outcomeMap, setOutcomeMap] = useState(() => loadJson("relista_outcome", {}));
  const [markets, setMarkets] = useState(() => loadJson("relista_markets", []));
  const [activeMarket, setActiveMarket] = useState(() => localStorage.getItem("relista_market") || "");

  const persistSaved = (next) => {
    setSaved(next);
    localStorage.setItem("relista_saved", JSON.stringify(next));
  };
  const persistStatus = (next) => {
    setStatusMap(next);
    localStorage.setItem("relista_status", JSON.stringify(next));
  };
  const persistOutcome = (next) => {
    setOutcomeMap(next);
    localStorage.setItem("relista_outcome", JSON.stringify(next));
  };
  const persistMarkets = (next) => {
    setMarkets(next);
    localStorage.setItem("relista_markets", JSON.stringify(next));
  };

  const setLeadStatus = (event, lead, value) => {
    event?.stopPropagation?.();
    persistStatus({ ...statusMap, [lead.orgnr]: value });
  };

  const setLeadOutcome = (event, lead, value) => {
    event?.stopPropagation?.();
    persistOutcome({
      ...outcomeMap,
      [lead.orgnr]: value === "Not recorded" ? "Not recorded" : { value, at: Date.now() },
    });
  };

  const loadPager = async () => {
    try {
      const res = await fetch(`${API}/one-pager`);
      const data = await res.json();
      setOffer(parseOffer(data.text || ""));
    } catch {
      setOffer(EMPTY_OFFER);
    }
  };

  const search = async (query, nextPage = 0) => {
    const next = (query || q).trim() || "Oslo, programvare";
    setQ(next);
    localStorage.setItem("leadflow_q", next);
    setBusy("search");
    setSearchError("");
    if (nextPage === 0) setLeads([]);
    try {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(next)}&page=${nextPage}&size=50`);
      if (!res.ok) throw new Error("bad");
      const data = await res.json();
      const rows = data.items || data.leads || [];
      const merged = nextPage === 0 ? rows : [...leads, ...rows];
      setLeads(merged);
      setPage(data.page ?? nextPage);
      const city = data.city || next.split(",")[0];
      const sector = data.sector || "programvare";
      setSearchMeta({
        city,
        sector,
        total: Number(data.total ?? merged.length),
        page: data.page ?? nextPage,
        pageSize: Number(data.size || data.page_size || 50),
        loaded: merged.length,
        form: data.company_form || "AS",
        source: data.source || "Brreg Enhetsregisteret",
      });
      setRetrievedAt(data.retrieved_at || new Date().toISOString());
      if (nextPage === 0) {
        const seenKey = `relista_seen_${next.toLowerCase()}`;
        const prev = loadJson(seenKey, []);
        const ids = rows.map((r) => r.orgnr).filter(Boolean);
        const marketSeen = (markets.find((m) => m.q.toLowerCase() === next.toLowerCase()) || {}).seen || [];
        const prior = prev.length ? prev : marketSeen;
        const fresh = prior.length ? ids.filter((id) => !prior.includes(id)) : [];
        setNewIds(fresh);
        localStorage.setItem(seenKey, JSON.stringify([...new Set([...prior, ...ids])].slice(-800)));
        const nextMarkets = markets.map((m) =>
          m.q.toLowerCase() === next.toLowerCase()
            ? { ...m, seen: [...new Set([...(m.seen || []), ...ids])].slice(-800), lastAt: Date.now(), total: Number(data.total ?? rows.length) }
            : m
        );
        persistMarkets(nextMarkets);
      }
      setOpen(null);
      setModell("");
      setKind("");
      setVote("");
      if (data.unmapped_city) setSearchError(data.message || `${city} is not a mapped kommune yet.`);
      else if (!(data.total || rows.length)) setSearchError("No matching companies.");
      const want = localStorage.getItem("relista_open_orgnr");
      if (want) {
        localStorage.removeItem("relista_open_orgnr");
        const hit = rows.find((r) => r.orgnr === want);
        if (hit) setOpen(hit);
      }
    } catch {
      if (nextPage === 0) setLeads([]);
      setSearchError("Brreg unavailable. Try again.");
      setRetrievedAt("");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    loadPager();
    const dashView = localStorage.getItem("relista_dash_view");
    if (dashView && dashView !== "all") setView(dashView);
    localStorage.removeItem("relista_dash_view");
    if (localStorage.getItem("leadflow_run") === "1") {
      localStorage.removeItem("leadflow_run");
      search(localStorage.getItem("leadflow_q") || "Oslo, programvare");
    } else {
      fetch(`${API}/leads`)
        .then((r) => r.json())
        .then((d) => setLeads(Array.isArray(d) ? d : d.leads || []))
        .catch(() => {});
    }
  }, []);

  const saveOffer = async () => {
    await fetch(`${API}/one-pager`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: formatOffer(offer) }),
    });
    setShowOffer(false);
  };

  const saveMarket = () => {
    const name = marketTitle(searchMeta.city, searchMeta.sector);
    const row = {
      id: `${searchMeta.city}-${searchMeta.sector}`.toLowerCase().replace(/\s+/g, "-"),
      name,
      q: q.trim() || "Oslo, programvare",
      city: searchMeta.city,
      sector: searchMeta.sector,
      minStaff,
      afterYear,
      seen: leads.map((l) => l.orgnr).filter(Boolean),
      total: searchMeta.total,
      lastAt: Date.now(),
    };
    const next = [row, ...markets.filter((m) => m.id !== row.id)].slice(0, 8);
    persistMarkets(next);
    setActiveMarket(row.id);
    localStorage.setItem("relista_market", row.id);
  };

  const openMarket = (m) => {
    setActiveMarket(m.id);
    localStorage.setItem("relista_market", m.id);
    if (m.minStaff != null) setMinStaff(m.minStaff || "");
    if (m.afterYear != null) setAfterYear(m.afterYear || "");
    search(m.q, 0);
  };

  const removeMarket = (event, id) => {
    event.stopPropagation();
    const next = markets.filter((m) => m.id !== id);
    persistMarkets(next);
    if (activeMarket === id) {
      setActiveMarket("");
      localStorage.removeItem("relista_market");
    }
  };

  const clearMarkets = () => {
    persistMarkets([]);
    setActiveMarket("");
    localStorage.removeItem("relista_market");
  };

  const visible = useMemo(() => {
    const rows = leads.filter((l) => {
      const staff = Number(l.employees || 0);
      const y = Number(yearOf(l) || 0);
      if (minStaff !== "" && staff < Number(minStaff)) return false;
      if (afterYear !== "" && (!y || y < Number(afterYear))) return false;
      if (onlySaved && !saved[l.orgnr]) return false;
      if (view === "new" && !newIds.includes(l.orgnr)) return false;
      if (view === "statusNew" && leadStatus(statusMap, l.orgnr) !== "Not reviewed") return false;
      if (view === "ready" && leadStatus(statusMap, l.orgnr) !== "Ready to contact") return false;
      if (view === "researching" && leadStatus(statusMap, l.orgnr) !== "Researching") return false;
      if (view === "contacted" && leadStatus(statusMap, l.orgnr) !== "Contacted") return false;
      if (view === "skip" && leadStatus(statusMap, l.orgnr) !== "Skip") return false;
      if (view === "saved" && !saved[l.orgnr]) return false;
      if (view === "high" && emailQuality(l) !== "Good") return false;
      if (view === "sent" && outcomeRecord(outcomeMap, l.orgnr).value !== "Sent") return false;
      if (view === "replied" && outcomeRecord(outcomeMap, l.orgnr).value !== "Replied") return false;
      if (view === "meeting" && outcomeRecord(outcomeMap, l.orgnr).value !== "Meeting") return false;
      return true;
    });
    if (listMode === "pack") {
      return [...rows]
        .filter((l) => !isShellCompany(l))
        .sort((a, b) => fitScore(b) - fitScore(a))
        .slice(0, PACK_SIZE);
    }
    if (sortBy === "fit") {
      return [...rows].sort((a, b) => fitScore(b) - fitScore(a));
    }
    if (sortBy === "newest") {
      return [...rows].sort((a, b) => Number(yearOf(b) || 0) - Number(yearOf(a) || 0));
    }
    if (sortBy === "staff") {
      return [...rows].sort((a, b) => Number(b.employees || 0) - Number(a.employees || 0));
    }
    return rows;
  }, [leads, minStaff, afterYear, onlySaved, saved, view, newIds, statusMap, outcomeMap, sortBy, listMode]);

  const savedCount = Object.keys(saved).length;
  const statusNewCount = leads.filter((l) => leadStatus(statusMap, l.orgnr) === "Not reviewed").length;
  const readyCount = Object.values(statusMap).filter((s) => s === "Ready to contact").length;
  const researchingCount = Object.values(statusMap).filter((s) => s === "Researching").length;
  const contactedCount = Object.values(statusMap).filter((s) => s === "Contacted").length;
  const skipCount = Object.values(statusMap).filter((s) => s === "Skip").length;
  const sentCount = Object.values(outcomeMap).filter((s) => (typeof s === "string" ? s : s?.value) === "Sent").length;
  const repliedCount = Object.values(outcomeMap).filter((s) => (typeof s === "string" ? s : s?.value) === "Replied").length;
  const meetingCount = Object.values(outcomeMap).filter((s) => (typeof s === "string" ? s : s?.value) === "Meeting").length;
  const filterCount = [minStaff !== "", afterYear !== "", onlySaved].filter(Boolean).length;
  const title = marketTitle(searchMeta.city, searchMeta.sector);

  const closeDrawer = () => {
    setOpen(null);
    setModell("");
    setKind("");
    setVote("");
    setVoteReason("");
    setComment("");
    setCopied("");
  };

  const openLead = async (lead) => {
    if (open?.orgnr === lead.orgnr) {
      closeDrawer();
      return;
    }
    setOpen(lead);
    setModell("");
    setKind("");
    setVote("");
    setVoteReason("");
    try {
      const res = await fetch(`${API}/leads/${lead.orgnr}`);
      const data = await res.json();
      if (data.lead) setOpen({ ...lead, ...data.lead });
    } catch {
      /* keep row */
    }
  };

  const toggleSave = (event, lead) => {
    event.stopPropagation();
    const next = { ...saved };
    if (next[lead.orgnr]) delete next[lead.orgnr];
    else next[lead.orgnr] = { at: Date.now(), company: lead.company };
    persistSaved(next);
  };

  const runNote = async () => {
    if (!open?.orgnr) return;
    setBusy("note");
    try {
      const res = await fetch(`${API}/leads/${open.orgnr}/brief`, { method: "POST" });
      const data = await res.json();
      setModell(data.modell || "");
      setKind("note");
    } catch {
      setModell("Note failed.");
      setKind("note");
    } finally {
      setBusy("");
    }
  };

  const runDraft = async () => {
    if (!open?.orgnr) return;
    setBusy("draft");
    setVote("");
    try {
      await saveOffer();
      const res = await fetch(`${API}/leads/${open.orgnr}/draft`, { method: "POST" });
      const data = await res.json();
      let text = data.modell || "";
      if (emailQuality(open) === "Weak" && text && !/right person at/i.test(text)) {
        text = `${text.trim()}\n\nIf this is relevant for the right person at ${open.company}, please feel free to forward this message or let me know who I should contact.`;
      }
      setModell(text);
      setKind("draft");
    } catch {
      setModell("Draft failed.");
      setKind("draft");
    } finally {
      setBusy("");
    }
  };

  const copyText = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(label);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  };

  const sendVote = (outcome, reason = "") => {
    setVote(outcome);
    const row = {
      at: Date.now(),
      outcome,
      reason,
      comment,
      q,
      market: title,
      orgnr: open?.orgnr,
      company: open?.company,
      draft: modell,
      offer: formatOffer(offer),
    };
    const loaded = loadJson("relista_feedback", []);
    const prev = Array.isArray(loaded) ? loaded : [];
    prev.unshift(row);
    localStorage.setItem("relista_feedback", JSON.stringify(prev.slice(0, 50)));
  };

  const exportCsv = () => {
    const header = ["company", "orgnr", "city", "sector", "employees", "founded", "email", "status", "outcome"];
    const rows = visible.map((l) =>
      [l.company, l.orgnr, l.city, naceLabel(l), l.employees || "", yearOf(l), l.email || "", leadStatus(statusMap, l.orgnr), outcomeLabel(outcomeMap, l.orgnr)]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = `\uFEFF${[header.join(","), ...rows].join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relista-leads.csv";
    a.click();
  };

  const field = (key, label) => (
    <label className="block text-xs text-gray-300 mb-2">
      {label}
      <input
        value={offer[key]}
        onChange={(e) => setOffer({ ...offer, [key]: e.target.value })}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white outline-none"
      />
    </label>
  );

  const chip = (id, label) => (
    <button
      type="button"
      onClick={() => setView(view === id ? "all" : id)}
      className={`px-3 py-1.5 rounded-full text-sm border ${
        view === id ? "bg-blue-600 border-blue-500" : "bg-white/5 border-white/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex text-white">
      <div className="flex-1 min-w-0 p-6 overflow-auto">
        {markets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {markets.map((m) => (
              <span
                key={m.id}
                className={`inline-flex items-center gap-1 rounded-full text-sm border ${
                  activeMarket === m.id ? "bg-blue-600 border-blue-500" : "bg-white/5 border-white/10"
                }`}
              >
                <button type="button" onClick={() => openMarket(m)} className="pl-3 py-1.5">
                  {m.name}
                </button>
                <button
                  type="button"
                  onClick={(event) => removeMarket(event, m.id)}
                  className="pr-2 py-1.5 text-gray-300 hover:text-white"
                  title="Remove market"
                >
                  ×
                </button>
              </span>
            ))}
            <button type="button" onClick={clearMarkets} className="text-xs text-gray-400 underline">
              Clear markets
            </button>
          </div>
        )}

        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h2 className="text-xl font-semibold">{listMode === "pack" ? "This week's work pack" : title}</h2>
            <p className="text-sm text-gray-400 mt-1">
              Each row is an AS retrieved from Brreg that matches the current saved market rules.
            </p>
            <p className="text-sm text-gray-400">
              {listMode === "pack"
                ? `${visible.length} of ${PACK_SIZE} in this week's pack`
                : `${searchMeta.total || visible.length} in the current matching market${visible.length ? ` | Showing 1-${visible.length}` : ""}`}
            </p>
            <p className="text-sm text-gray-400">
              New since last market check: {newIds.length} | Not reviewed: {statusNewCount} | {readyCount} ready to contact
            </p>
            <p className="text-xs text-gray-500 mt-1">
              New since last check means this organisation matches the saved market now but was not in the previous saved-market snapshot.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {searchMeta.form || "AS"} | Registered business address | Configured software NACE codes | municipality match
            </p>
            {retrievedAt && !searchError && (
              <p className="text-xs text-green-400 mt-0.5">Live Brreg search | Retrieved just now</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={saveMarket} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm">
              Save market
            </button>
            <button type="button" onClick={exportCsv} className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm">
              Export CSV
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setListMode("market");
            search();
          }}
          className="flex gap-2 mb-3"
        >
          <input
            value={q}
            onChange={(e) => {
              const el = e.target;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              let v = el.value;
              if (v) v = v.charAt(0).toUpperCase() + v.slice(1);
              setQ(v);
              requestAnimationFrame(() => {
                try {
                  el.setSelectionRange(start, end);
                } catch {
                  /* ignore */
                }
              });
            }}
            className="flex-1 px-4 py-2 rounded-xl bg-white text-black outline-none"
            placeholder="Oslo, programvare"
          />
          <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600">
            {busy === "search" ? "Searching..." : "Search"}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => { setListMode("pack"); setSortBy("fit"); setView("all"); }}
            className={`px-3 py-1.5 rounded-full text-sm border ${listMode === "pack" ? "bg-blue-600 border-blue-500" : "bg-white/5 border-white/10"}`}
          >
            This week's work pack
          </button>
          <button
            type="button"
            onClick={() => setListMode("market")}
            className={`px-3 py-1.5 rounded-full text-sm border ${listMode === "market" ? "bg-blue-600 border-blue-500" : "bg-white/5 border-white/10"}`}
          >
            Matching market
          </button>
          {CITIES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => search(c.q)}
              className="px-3 py-1.5 rounded-full text-sm bg-white/5 border border-white/10"
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {chip("new", `New since last market check: ${newIds.length}`)}
          {chip("statusNew", `Not reviewed: ${statusNewCount}`)}
          {chip("researching", `Researching: ${researchingCount}`)}
          {chip("ready", `Ready: ${readyCount}`)}
          {chip("contacted", `Contacted: ${contactedCount}`)}
          {chip("skip", `Skip: ${skipCount}`)}
          {chip("saved", `Saved: ${savedCount}`)}
          {chip("sent", `Sent: ${sentCount}`)}
          {chip("replied", `Replied: ${repliedCount}`)}
          {chip("meeting", `Meeting: ${meetingCount}`)}
          <button
            type="button"
            onClick={() => setShowFilters((v) => {
              const next = !v;
              if (next) setListMode("market");
              return next;
            })}
            className="px-3 py-1.5 rounded-full text-sm bg-white/5 border border-white/10"
          >
            Filters{filterCount ? ` | ${filterCount} active` : ""}
          </button>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4 text-sm">
            <div className="flex flex-wrap gap-4 items-center">
              <label className="text-gray-300">
                Min employees
                <input
                  type="number"
                  min="0"
                  value={minStaff}
                  onChange={(e) => setMinStaff(e.target.value)}
                  className="ml-2 w-20 px-2 py-1 rounded bg-white text-black"
                />
              </label>
              <label className="text-gray-300">
                Founded after
                <input
                  type="number"
                  min="1900"
                  placeholder="year"
                  value={afterYear}
                  onChange={(e) => setAfterYear(e.target.value)}
                  className="ml-2 w-24 px-2 py-1 rounded bg-white text-black"
                />
              </label>
              <label className="text-gray-300">Company type
                <span className="ml-2 text-white">AS</span>
              </label>
              <label className="text-gray-300 flex items-center gap-2">
                <input type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} />
                Saved only
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Search rules: registered business address | configured software NACE codes | AS | mapped municipality only
            </p>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 mb-4 flex justify-between items-center gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Your offer</div>
            <p className="text-sm text-gray-200 mt-1">
              {offer.who} | {offer.outcome}
            </p>
          </div>
          <button type="button" onClick={() => setShowOffer((v) => !v)} className="text-sm px-3 py-1 rounded bg-white/10">
            {showOffer ? "Close" : "Edit offer"}
          </button>
        </div>

        {showOffer && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-6">
            <div className="grid md:grid-cols-2 gap-3">
              {field("who", "Who do you help?")}
              {field("problem", "What problem do you solve?")}
              {field("outcome", "What outcome do customers get?")}
              <label className="block text-xs text-gray-400 mb-2 md:col-span-2">
                Why might this type of company care?
                <input
                  value={offer.why}
                  onChange={(e) => setOffer({ ...offer, why: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white outline-none"
                />
              </label>
              {field("cta", "Call to action")}
              <label className="block text-xs text-gray-400 mb-2">
                Language
                <select
                  value={offer.lang}
                  onChange={(e) => setOffer({ ...offer, lang: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white outline-none"
                >
                  <option>English</option>
                  <option>Norwegian</option>
                </select>
              </label>
            </div>
            <button type="button" onClick={saveOffer} className="mt-2 text-sm px-3 py-1 rounded bg-blue-600">
              Save offer
            </button>
          </div>
        )}

        {searchError && (
          <p className="text-amber-300 text-sm mb-3">
            We could not retrieve live Brreg results right now.{" "}
            <button type="button" className="underline" onClick={() => search(q, 0)}>
              Try again
            </button>
          </p>
        )}
        {busy === "search" && <p className="text-gray-400 text-sm mb-3">Searching Brreg...</p>}
        {!busy && !searchError && !visible.length && (
          <p className="text-gray-500 text-sm mb-3">No companies found for this view. Clear filters or search again.</p>
        )}

        <div className="flex justify-end mb-2">
          <label className="text-xs text-gray-400">
            Sort by{" "}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="ml-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-white"
            >
              <option value="fit">This week's work pack</option>
              <option value="default">Default (Brreg order)</option>
              <option value="newest">Newest</option>
              <option value="staff">Most employees</option>
            </select>
          </label>
        </div>

        <div className="overflow-auto max-h-[58vh] rounded-xl border border-white/10">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="text-gray-400 text-left sticky top-0 bg-[#0B1220] z-10">
              <tr>
                <th className="py-3 px-3">Company</th>
                <th className="px-3">City</th>
                <th className="px-3">Sector</th>
                <th className="px-3">Staff</th>
                <th className="px-3 whitespace-nowrap">Founded</th>
                <th className="px-3 whitespace-nowrap">Email</th>
                <th className="px-3">Status</th>
                <th className="px-3">Outcome</th>
                <th className="px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr
                  key={l.orgnr}
                  onClick={() => openLead(l)}
                  className={`border-t border-white/10 cursor-pointer hover:bg-white/10 ${
                    open?.orgnr === l.orgnr ? "bg-blue-600/20 border-l-2 border-l-blue-500" : ""
                  }`}
                >
                  <td className="py-3 px-2 font-medium" title={`${l.company} — ${fitReason(l)}`}>
                    <div className="truncate">
                      {newIds.includes(l.orgnr) ? <span className="text-blue-300 mr-1">New</span> : null}
                      {l.company}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {inclusionLine(l, newIds.includes(l.orgnr)).label}: {inclusionLine(l, newIds.includes(l.orgnr)).text}
                    </div>
                  </td>
                  <td className="px-2 truncate" title={l.city}>{l.city}</td>
                  <td className="px-2 truncate" title={naceVerify(l)}>{naceLabel(l)}</td>
                  <td className="px-2">{l.employees ? l.employees : "-"}</td>
                  <td className="px-3 whitespace-nowrap">{yearOf(l) || "-"}</td>
                  <td className="px-3 truncate" title={l.email || "No official email published"}>
                    {l.email ? `${l.email} (${emailQuality(l)})` : "No official email published"}
                  </td>
                  <td className="px-2" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={leadStatus(statusMap, l.orgnr)}
                      onChange={(event) => setLeadStatus(event, l, event.target.value)}
                      className="bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] w-full max-w-full"
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2" onClick={(event) => event.stopPropagation()}>
                    <select
                      value={outcomeRecord(outcomeMap, l.orgnr).value}
                      title={outcomeLabel(outcomeMap, l.orgnr)}
                      onChange={(event) => setLeadOutcome(event, l, event.target.value)}
                      className="bg-black/40 border border-white/10 rounded px-1 py-1 text-[11px] w-full max-w-full"
                    >
                      {OUTCOMES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-blue-400 underline mr-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(brregLink(l), "_blank", "noopener,noreferrer");
                      }}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      className={saved[l.orgnr] ? "text-amber-300" : "text-gray-400"}
                      onClick={(event) => toggleSave(event, l)}
                    >
                      {saved[l.orgnr] ? "★" : "☆"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listMode === "market" && searchMeta.total > leads.length && (
          <button type="button" onClick={() => search(q, page + 1)} className="mt-3 px-4 py-2 rounded-lg bg-white/10 text-sm">
            Load more
          </button>
        )}
      </div>

      {open && (
        <aside className="w-[400px] shrink-0 border-l border-white/10 p-5 overflow-auto">
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs text-blue-300">BRREG | official</div>
            <button type="button" onClick={closeDrawer} className="text-gray-400 text-sm">
              Close
            </button>
          </div>
          <h3 className="text-lg font-semibold mb-1">{open.company}</h3>
          <p className="text-xs text-gray-400 mb-1">Match to your offer</p>
          <p className="text-sm text-white mb-1">
            {inclusionLine(open, newIds.includes(open.orgnr)).label}: {inclusionLine(open, newIds.includes(open.orgnr)).text}
          </p>
          <p className="text-xs text-gray-400 mb-3">{fitWhy(open)}. Not buying intent.</p>
          <p className="text-xs text-gray-400 mb-3">{emailNotice(open)}</p>
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="px-2 py-1 rounded-full bg-blue-600/30 text-blue-100">Official source</span>
            <span className={`px-2 py-1 rounded-full ${open.email ? "bg-green-500/20 text-green-200" : "bg-white/10 text-gray-300"}`}>
              {open.email ? (emailQuality(open) === "Good" ? "Published work email" : "Shared company inbox") : "No official email published"}
            </span>
            {newIds.includes(open.orgnr) ? <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">New since last market check</span> : null}
            <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">{naceLabel(open)}</span>
            {open.employees ? <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">{open.employees} staff</span> : null}
            {yearOf(open) ? <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">Founded {yearOf(open)}</span> : null}
            {recentFounded(open) ? <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200">Recently registered</span> : null}
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mb-4 text-sm text-gray-200">
            <p className="mb-1">City {open.city}</p>
            <p className="mb-1">Founded {open.founded || "-"}</p>
            <p className="mb-1">Employees {open.employees ? open.employees : "-"}</p>
            <p className="mb-1">Sector {naceLabel(open)}</p>
            <p className="mb-1">{naceVerify(open)}</p>
            <p className="mb-1 break-words whitespace-pre-wrap max-h-40 overflow-auto">
              Official purpose (Norwegian)
              <br />
              {formatPurpose(open.purpose)}
            </p>
            <p className="mt-2 pt-2 border-t border-white/10">
              Contact {emailStatus(open)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{emailNotice(open)}</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <a href={brregLink(open)} target="_blank" rel="noreferrer" className="text-blue-400">
              Verify on Brreg
            </a>
            <button type="button" className="text-blue-400" onClick={() => copyText("Company", open.company)}>
              Copy company name
            </button>
            <button type="button" className="text-amber-300" onClick={(e) => toggleSave(e, open)}>
              {saved[open.orgnr] ? "★ Saved company" : "☆ Save this company"}
            </button>
            <select
              value={leadStatus(statusMap, open.orgnr)}
              onChange={(event) => setLeadStatus(event, open, event.target.value)}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              value={outcomeRecord(outcomeMap, open.orgnr).value}
              onChange={(event) => setLeadOutcome(event, open, event.target.value)}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            >
              {OUTCOMES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 mb-2">Outcomes are recorded by you. Relista does not send email or automatically detect replies or meetings.</p>
          {outcomeRecord(outcomeMap, open.orgnr).value !== "Not recorded" && (
            <p className="text-xs text-gray-300 mb-2">{outcomeLabel(outcomeMap, open.orgnr)}</p>
          )}
          <div className="flex gap-2 my-4">
            <button type="button" onClick={runNote} className="flex-1 py-2 rounded-lg bg-white/10">
              {busy === "note" ? "..." : "Note"}
            </button>
            <button type="button" onClick={runDraft} className="flex-1 py-2 rounded-lg bg-blue-600">
              {busy === "draft" ? "..." : "Draft email"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <button type="button" onClick={() => copyText("Facts", factsText(open))} className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/10">
              Copy facts
            </button>
            <button type="button" onClick={() => copyText("Text", modell)} className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/10">
              Copy text
            </button>
            {kind === "draft" && (
              <button type="button" onClick={runDraft} className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/10">
                {busy === "draft" ? "..." : "Regenerate"}
              </button>
            )}
            {copied && <span className="text-green-300 self-center">Copied {copied}</span>}
          </div>
          {kind === "draft" && (
            <p className="text-xs text-gray-500 mb-2">
              This is a draft based on official company facts and your offer. Review the recipient, relevance, wording, and whether contact is appropriate before sending. Relista does not send email.
            </p>
          )}
          {kind === "draft" && open.purpose && (
            <p className="text-xs text-gray-500 mb-2">Official purpose is shown in the drawer — not copied into the email.</p>
          )}
          <div className="text-xs uppercase tracking-wide text-amber-300 mb-2">
            {kind === "note" ? "Generated from official facts" : "AI DRAFT - REVIEW BEFORE USE"}
          </div>
          <textarea
            value={modell}
            onChange={(e) => setModell(e.target.value)}
            rows={14}
            className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-sm outline-none"
          />
          {kind === "draft" && modell && (
            <div className="mt-4 text-sm">
              <p className="text-gray-200 mb-3 text-base">Would you send this after one edit?</p>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => sendVote("yes")}
                  className={`flex-1 py-3 rounded-xl font-medium ${vote === "yes" ? "bg-blue-600" : "bg-white/10"}`}
                >
                  Yes, I would
                </button>
                <button
                  type="button"
                  onClick={() => sendVote("needs_work", voteReason)}
                  className={`flex-1 py-3 rounded-xl font-medium ${vote === "needs_work" ? "bg-blue-600" : "bg-white/10"}`}
                >
                  Needs work
                </button>
              </div>
              {vote === "needs_work" && (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {NEEDS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setVoteReason(r);
                          sendVote("needs_work", r);
                        }}
                        className={`px-2 py-1 rounded text-xs ${voteReason === r ? "bg-white/20" : "bg-white/5"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What would make this usable?"
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm outline-none"
                  />
                </>
              )}
              {vote === "yes" && <p className="text-green-300 text-xs mt-2">Saved. That is the founder test.</p>}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

