# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


```mermaid
flowchart LR
  subgraph In["Input"]
    A[City + sector]
  end

  subgraph Data["Official data"]
    B[Enhetsregisteret]
    C[Pack of ~15<br/>ranked by fit]
  end

  subgraph Review["Company drawer"]
    D[Brreg facts]
    E[Email: published / shared / none]
    F[ICP match High · Med · Low]
  end

  subgraph Out["You act"]
    G[Edit + copy draft]
    H[Send yourself]
    I[Status + CSV]
  end

  A --> B --> C --> D --> E --> F --> G --> H --> I
```

**Trust rules:** Brreg only · no invented contacts · AI is interpretation not fact · Relista never sends email.
