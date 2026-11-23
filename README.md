# French Companies Verification API & MCP Server (x402 Protocol)

Production-ready commercial Micro-API and **Model Context Protocol (MCP)** server that allows AI agents and clients (Claude Desktop, Cursor, Antigravity, Claude Code) to verify and certify French companies in real time using official French Government data (`recherche-entreprises.api.gouv.fr`), monetized via the **x402** HTTP payment standard (USDC on Base network).

---

## 🚀 Key Capabilities

- **MCP Tool for AI Agents**: Exposes the `verify_french_company` tool, compatible with any MCP client (Claude Desktop, Cursor, Antigravity).
- **Native x402 Micro-payments**: Automated 0.15 USDC payment handling on Base (via `EVM_PRIVATE_KEY` or `X-PAYMENT` header) or human/agent-readable 402 payment instructions.
- **Official Government Data**: Direct integration with French National Registry (INSEE / SIRENE / RNE).
- **Automated Intra-Community VAT**: Computes the official French VAT number (`FR` + key + SIREN).
- **Complete Business Identity**: Returns company status (Active/Closed), headquarters SIRET, legal name, creation date, main activity (NAF/APE code), address, and corporate officers.

---

## ⚡ Quickstart: Add MCP Server in 10 Seconds

You can connect this MCP tool to **Claude Desktop**, **Cursor**, or **Antigravity** in seconds.

### 1. Claude Desktop Setup

Open your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following configuration block under `mcpServers`:

```json
{
  "mcpServers": {
    "entreprises-fr": {
      "command": "node",
      "args": [
        "c:/Users/innoc/Desktop/api-entreprises-fr/mcp-server.js"
      ],
      "env": {
        "API_BASE_URL": "https://api-entreprises-fr.onrender.com",
        "EVM_PRIVATE_KEY": "0x_YOUR_BASE_WALLET_PRIVATE_KEY_HERE"
      }
    }
  }
}
```

> **Note**: If `EVM_PRIVATE_KEY` is omitted, the MCP tool will still execute and return clear machine-readable x402 payment instructions (recipient address, 0.15 USDC amount on Base) directly in the chat.

---

### 2. Cursor Setup

Add the configuration into `.cursor/mcp.json` in your project or in Cursor Settings > Features > MCP:

```json
{
  "mcpServers": {
    "entreprises-fr": {
      "command": "node",
      "args": [
        "c:/Users/innoc/Desktop/api-entreprises-fr/mcp-server.js"
      ],
      "env": {
        "API_BASE_URL": "https://api-entreprises-fr.onrender.com",
        "EVM_PRIVATE_KEY": "0x_YOUR_BASE_WALLET_PRIVATE_KEY_HERE"
      }
    }
  }
}
```

---

## 🛠️ MCP Tool Reference

### `verify_french_company`

Verifies the legal existence and details of a French company.

#### Input Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **Yes** | Company name or 9-digit SIREN number (e.g., `"552032534"` or `"Danone"`). |

#### Output Example (Payment Verified)
```json
{
  "nom_complet": "DANONE",
  "siren": "552032534",
  "siret_siege": "55203253400703",
  "statut": "Actif",
  "date_creation": "1955-01-01",
  "activite_principale": "70.10Z",
  "adresse": "59-61 RUE LA FAYETTE 75009 PARIS",
  "dirigeants": [
    {
      "type": "personne physique",
      "nom": "BERNARD DE SAINT AFFRIQUE",
      "prenoms": "ANTOINE",
      "qualite": "Directeur Général",
      "annee_de_naissance": "1964"
    }
  ],
  "numero_tva_intracommunautaire": "FR27552032534"
}
```

#### Output Example (When Unpaid)
```json
{
  "status": "PAYMENT_REQUIRED",
  "http_code": 402,
  "protocol": "x402",
  "message": "Paiement requis pour accéder aux données certifiées de cette entreprise.",
  "payment_requirements": {
    "price": "0.15 USDC",
    "max_amount_atomic": "150000",
    "network": "base",
    "pay_to_address": "0xB1b0f5a198D1a8344d32172f29D73fa3FaA74B4c",
    "usdc_contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "scheme": "exact"
  }
}
```

---

## 🌐 HTTP REST Endpoints

### 1. `GET /` — Service Metadata (Free)
Returns general API information, pricing, Base network configuration, and usage examples.

### 2. `GET /api/company?q=SIREN_OR_NAME` — Company Verification (0.15 USDC)
- **Live Endpoint**: `https://api-entreprises-fr.onrender.com/api/company?q=552032534`
- Requires standard x402 payment header `X-PAYMENT`.
- Returns HTTP 402 with EIP-712 payment challenge when unpaid.

---

## 💻 Local Development & Testing

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
npm test
```

### Start Local Express Server
```bash
npm start
```

### Start MCP Server via Stdio
```bash
npm run mcp
```
