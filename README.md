# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


## Flow

```mermaid
flowchart LR
  A[City and sector] --> B[Enhetsregisteret]
  B --> C[Weekly pack of 15]
  C --> D[Why included]
  D --> E[Draft email]
  E --> F[You send]
  F --> G[Mark Sent, Replied, or Meeting]
