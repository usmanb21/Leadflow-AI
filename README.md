# Relista

Weekly work pack for Norwegian B2B teams.

Search a city and sector, get registered AS companies from Enhetsregisteret, see why each row is in the pack, and edit a first email. Relista does not send email and does not invent contacts.

Private MVP. Runs locally: FastAPI plus React.


```mermaid
flowchart TB
  A["1. City and sector"] --> B["2. Enhetsregisteret"]
  B --> C["3. Pack of about 15"]
  C --> D["4. Why included"]
  D --> E["5. Draft from your offer"]
  E --> F["6. You review and send"]
  F --> G["7. Mark the outcome"]
