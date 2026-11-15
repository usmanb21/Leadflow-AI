# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


```mermaid
flowchart TB
  subgraph ENTRY["1. Start"]
    A[Open Relista · localhost]
    B[Dashboard: saved markets + this week's pack]
  end

  subgraph SEARCH["2. Find companies · Brreg only"]
    C[Type city + sector<br/>e.g. Oslo · programvare]
    D[Query Enhetsregisteret]
    E[Registered AS companies<br/>name · orgnr · city · NACE · staff · founded · public email if any]
  end

  subgraph PACK["3. Weekly work pack"]
    F[Cap ~15 companies]
    G[Rank: email quality → staff band → company age]
    H[Show rule in one line<br/>profile fit · not buying intent]
  end

  subgraph ROW["4. Open one company"]
    I[Table row click]
    J[Drawer: Brreg facts<br/>source + retrieved time]
    K{Public email?}
    K -->|Yes| L[Label: Published company email<br/>or Shared inbox]
    K -->|No| M[Label: No public email found]
  end

  subgraph INTEL["5. Intelligence · optional"]
    N[Generate intelligence]
    O[Brreg facts + offer/ICP]
    P[Lightweight research notes]
    Q[ICP match: High / Medium / Low]
    R[Match reasons + rationale]
    S{News evidence?}
    S -->|No| T[No source-backed recent<br/>development found]
    S -->|Yes| U[Grounded note only]
  end

  subgraph DRAFT["6. Outreach · human sends"]
    V[1–2 draft emails]
    W[Sign-off: Usman · Founder, Relista]
    X[Edit in place]
    Y[Copy draft]
    Z[You send from your own inbox]
  end

  subgraph OUTCOME["7. Track"]
    AA[Status: New / Researching / Ready / Contacted / Skip]
    AB[Outcome: Replied / Meeting / …]
    AC[CSV export: orgnr · city · sector · email · status]
  end

  subgraph ASK["8. Ask · secondary"]
    AD[Documents · quick research]
    AE[Not the sales pitch]
  end

  A --> B
  B --> C
  C --> D --> E --> F --> G --> H
  H --> I --> J --> K
  L --> N
  M --> N
  N --> O --> P --> Q --> R --> S
  T --> V
  U --> V
  V --> W --> X --> Y --> Z --> AA --> AB --> AC
  B -.-> AD --> AE

  style ENTRY fill:#0f172a,stroke:#334155,color:#e2e8f0
  style SEARCH fill:#0f172a,stroke:#1d4ed8,color:#e2e8f0
  style PACK fill:#0f172a,stroke:#1d4ed8,color:#e2e8f0
  style ROW fill:#0f172a,stroke:#334155,color:#e2e8f0
  style INTEL fill:#0f172a,stroke:#b45309,color:#e2e8f0
  style DRAFT fill:#0f172a,stroke:#15803d,color:#e2e8f0
  style OUTCOME fill:#0f172a,stroke:#334155,color:#e2e8f0
  style ASK fill:#0f172a,stroke:#475569,color:#94a3b8
```
