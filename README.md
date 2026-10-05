# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


## How a pack is made

1. You type a city and sector.
2. Relista reads matching AS companies from Enhetsregisteret.
3. The weekly pack keeps about 15, with a reason each row is included.
4. You open one company, edit the draft, and send it yourself.
5. You mark Sent, Replied, or Meeting. Relista does not send or detect replies.

```mermaid
flowchart TB
  A["1. City and sector"] --> B["2. Enhetsregisteret"]
  B --> C["3. Weekly pack of about 15"]
  C --> D["4. Why this company is included"]
  D --> E["5. Draft from Brreg facts and your offer"]
  E --> F["6. You review and send"]
  F --> G["7. You record Sent, Replied, or Meeting"]
