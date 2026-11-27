#!/usr/bin/env node

/**
 * =============================================================================
 * Serveur MCP (Model Context Protocol) - API Entreprises Françaises (x402)
 * =============================================================================
 *
 * Ce serveur MCP permet à tout client compatible (Claude Desktop, Claude Code,
 * Cursor, Antigravity, etc.) d'interroger et vérifier les entreprises françaises
 * via l'API commerciale déployée sur Render :
 * https://api-entreprises-fr.onrender.com/api/company
 *
 * Monétisation : Protocole x402 (0.15 USDC sur le réseau Base).
 * - Si EVM_PRIVATE_KEY est configurée, les micro-paiements sont signés et réglés automatiquement.
 * - Si aucun paiement n'est configuré, les instructions x402 précises sont renvoyées à l'IA.
 */

require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { createSigner } = require('x402/types');
const { createPaymentHeader, selectPaymentRequirements } = require('x402/client');

// Point d'entrée de l'API distante (configurable via variable d'environnement)
const API_BASE_URL = process.env.API_BASE_URL || 'https://api-entreprises-fr.onrender.com';

// Initialisation du serveur MCP
const server = new McpServer({
  name: 'mcp-entreprises-fr',
  version: '1.0.0',
  description: 'Serveur MCP permettant aux agents IA de vérifier les entreprises françaises via x402'
});

/**
 * Schéma de validation d'entrée (inputSchema) avec Zod pour le paramètre query
 */
const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe("Le nom commercial, la raison sociale ou le numéro SIREN (9 chiffres) de l'entreprise française à vérifier (ex: '552032534' ou 'Danone')")
};

/**
 * Les 4 annotations MCP standard (hints pour optimiser l'exécution par les modèles IA)
 */
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

/**
 * Logique d'exécution de l'outil verify_french_company
 */
async function verifyFrenchCompany({ query }) {
  try {
    const searchTerm = query.trim();
    const targetUrl = `${API_BASE_URL}/api/company?q=${encodeURIComponent(searchTerm)}`;

    // Récupération des configurations de paiement
    const privateKey = process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY || null;
    let paymentHeader = process.env.X_PAYMENT || process.env.PAYMENT_HEADER || null;

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'mcp-entreprises-fr/1.0.0'
    };

    if (paymentHeader) {
      headers['X-PAYMENT'] = paymentHeader;
    }

    // 1. Première requête vers l'API
    let response = await fetch(targetUrl, { headers });

    // 2. Si statut 402 et clé privée disponible : tentative de règlement automatique x402
    if (response.status === 402 && privateKey) {
      try {
        const challenge = await response.json();
        if (challenge.accepts && Array.isArray(challenge.accepts) && challenge.accepts.length > 0) {
          const selectedRequirement =
            selectPaymentRequirements(challenge.accepts, 'base') || challenge.accepts[0];

          // Création du signer EVM pour le réseau Base
          const signer = await createSigner(selectedRequirement.network || 'base', privateKey);

          // Génération de l'en-tête signé EIP-712
          const generatedHeader = await createPaymentHeader(
            signer,
            challenge.x402Version || 1,
            selectedRequirement
          );

          // Nouvelle tentative avec l'en-tête de paiement
          headers['X-PAYMENT'] = generatedHeader;
          response = await fetch(targetUrl, { headers });
        }
      } catch (paymentErr) {
        console.error('[mcp-entreprises-fr] Échec du paiement automatique x402:', paymentErr.message);
      }
    }

    // 3. Si le statut est 402 (sans paiement ou après échec du paiement)
    if (response.status === 402) {
      let challengeDetails = {};
      try {
        challengeDetails = await response.json();
      } catch {
        // Erreur de parsing optionnelle
      }

      const accept = (challengeDetails.accepts && challengeDetails.accepts[0]) || {};
      const paymentNotice = {
        status: 'PAYMENT_REQUIRED',
        http_code: 402,
        protocol: 'x402',
        message: 'Paiement requis pour accéder aux données certifiées de cette entreprise.',
        payment_requirements: {
          price: '0.15 USDC',
          max_amount_atomic: accept.maxAmountRequired || '150000',
          network: accept.network || 'base',
          pay_to_address: accept.payTo || '0xB1b0f5a198D1a8344d32172f29D73fa3FaA74B4c',
          usdc_contract: accept.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          scheme: accept.scheme || 'exact'
        },
        configuration_guide: {
          how_to_pay: "Ajoutez la variable d'environnement 'EVM_PRIVATE_KEY' avec votre clé privée (disposant d'USDC sur Base) dans la configuration de votre client MCP (Claude Desktop, Cursor, etc.) pour automatiser le paiement instantané.",
          alternative: "Vous pouvez également fournir un en-tête pré-signé via la variable d'environnement 'X_PAYMENT'."
        },
        raw_challenge: challengeDetails
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(paymentNotice, null, 2)
          }
        ]
      };
    }

    // 4. Gestion des erreurs HTTP (400, 404, 502, etc.)
    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Erreur API HTTP ${response.status}: ${errorText}`
          }
        ],
        isError: true
      };
    }

    // 5. Succès (200 OK) : retour des données complètes de l'entreprise
    const companyData = await response.json();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(companyData, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('[mcp-entreprises-fr] Exception interne:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Erreur lors de l'exécution de la requête : ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Enregistrement officiel de l'outil MCP avec validation Zod et les 4 annotations MCP
 */
server.tool(
  'verify_french_company',
  "Vérifie et certifie l'existence légale d'une entreprise française (SIREN, SIRET du siège, statut Actif/Fermé, TVA intracommunautaire, adresse officielle et dirigeants) via les données de l'État français. L'accès nécessite 0.15 USDC sur le réseau Base via le protocole x402.",
  inputSchema,
  annotations,
  verifyFrenchCompany
);

/**
 * Démarrage du transport Stdio pour communication JSON-RPC avec le client MCP
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-entreprises-fr] Serveur MCP démarré et connecté via Stdio.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[mcp-entreprises-fr] Erreur fatale au démarrage:', err);
    process.exit(1);
  });
}

module.exports = {
  server,
  verifyFrenchCompany,
  inputSchema,
  annotations
};
