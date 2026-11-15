# Relista

**Less searching. Better prospecting.**

Relista turns official Norwegian company-registry data into curated B2B prospecting packs. Choose a city and sector, review fit signals, and prepare outreach drafts you send yourself.

Relista does not send email and does not invent contacts.

## How it works

flowchart LR
    A["01<br/>Select market<br/>City + sector"]
    B["02<br/>Discover<br/>Live Brønnøysund data"]
    C["03<br/>Build pack<br/>~15 companies"]
    D["04<br/>Rank<br/>Prospect fit"]
    E["05<br/>Evaluate<br/>Company intelligence"]
    F["06<br/>Prepare<br/>Review & outreach drafts"]

    A --> B --> C --> D --> E --> F

    classDef start fill:#172554,stroke:#60A5FA,color:#FFFFFF,stroke-width:2px
    classDef process fill:#1E293B,stroke:#64748B,color:#FFFFFF,stroke-width:1.5px
    classDef finish fill:#064E3B,stroke:#34D399,color:#FFFFFF,stroke-width:2px

    class A start
    class B,C,D,E process
    class F finish

## Core capabilities

| Capability | Purpose |
|---|---|
| Weekly prospect packs | Curated list of companies for a saved market |
| Fit ranking | Ranks by email quality, staff band, and company age |
| Company intelligence | ICP match High / Medium / Low with reasons |
| P0 trust labels | Separates Brreg facts from AI interpretation |
| Outreach drafts | Editable first emails · copy only |
| Manual outcomes | Status and results stay under human control |

## Product principles

- **Evidence first** — Brønnøysundregistrene is the source of truth  
- **No fabricated intelligence** — abstain when evidence is missing  
- **Human control** — AI assists; you decide and send  

## Technology

| Layer | Stack |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Python, FastAPI |
| Company data | Brønnøysundregistrene · Enhetsregisteret |
| AI | Azure OpenAI |

---

Private MVP. Runs locally. Active development.
