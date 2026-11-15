# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


```mermaid
flowchart TB
  A[City + sector search] --> B[Live Enhetsregisteret results]
  B --> C[Weekly pack of ~15 · ranked by fit]
  C --> D[Open company · Brreg facts + email label]
  D --> E[Intelligence · ICP High / Medium / Low]
  E --> F[Edit draft · copy · you send]
  F --> G[Status + outcome + CSV export]
```

**Trust rules:** Brreg only · no invented contacts · AI is interpretation not fact · Relista never sends email.
