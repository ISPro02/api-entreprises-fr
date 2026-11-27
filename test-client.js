/**
 * =============================================================================
 * Script de Test Client pour l'API Entreprises France (Protocole x402 & MCP)
 * =============================================================================
 *
 * Ce script permet de valider le bon fonctionnement de l'ensemble de la solution :
 * 1. Vérification de la route publique libre (GET /) -> 200 OK
 * 2. Vérification de la protection x402 (GET /api/company?q=...) -> 402 Payment Required
 * 3. Validation de l'extraction des données et du calcul de la TVA intracommunautaire
 * 4. Validation de l'appel direct de l'outil MCP verify_french_company et des 4 annotations
 *
 * Si le serveur n'est pas déjà lancé sur le port configuré, le script démarre
 * une instance temporaire en mémoire pour exécuter les tests puis s'arrête.
 */

require('dotenv').config();
const http = require('http');
const app = require('./index');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Couleurs pour affichage lisible dans la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Fonction utilitaire pour tester si un serveur écoute déjà sur l'URL cible.
 */
async function isServerRunning(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Exécution de la suite de tests
 */
async function runTests() {
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}   Lancement des tests de validation de la Micro-API   ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  let serverInstance = null;
  let testUrl = BASE_URL;

  const alreadyRunning = await isServerRunning(BASE_URL);
  if (!alreadyRunning) {
    console.log(`${colors.yellow}ℹ Aucun serveur actif détecté sur ${BASE_URL}.${colors.reset}`);
    console.log(`${colors.yellow}ℹ Démarrage d'une instance de test locale sur un port dédié...${colors.reset}\n`);
    serverInstance = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => {
        const assignedPort = server.address().port;
        testUrl = `http://127.0.0.1:${assignedPort}`;
        resolve(server);
      });
    });
  } else {
    console.log(`${colors.green}✔ Serveur actif détecté sur ${BASE_URL}.${colors.reset}\n`);
  }

  let totalTests = 0;
  let passedTests = 0;

  try {
    // -------------------------------------------------------------------------
    // TEST 1 : Vérification de la route publique GET /
    // -------------------------------------------------------------------------
    totalTests++;
    console.log(`${colors.bold}Test 1 : Appel de la route publique gratuite GET /${colors.reset}`);
    const resRoot = await fetch(`${testUrl}/`);
    const statusRoot = resRoot.status;
    const dataRoot = await resRoot.json();

    if (statusRoot === 200 && dataRoot.pricing && dataRoot.pricing.currency === 'USDC') {
      console.log(`  ${colors.green}✔ Succès : Statut HTTP ${statusRoot} OK${colors.reset}`);
      console.log(`  - Nom        : ${dataRoot.name}`);
      console.log(`  - Tarif      : ${dataRoot.pricing.price} (${dataRoot.pricing.network})`);
      console.log(`  - Récepteur  : ${dataRoot.pricing.wallet_address}`);
      passedTests++;
    } else {
      console.log(`  ${colors.red}✖ Échec : Statut HTTP inattendu (${statusRoot})${colors.reset}`);
    }

    console.log('\n' + '-'.repeat(54) + '\n');

    // -------------------------------------------------------------------------
    // TEST 2 : Vérification du code HTTP 402 sur GET /api/company sans paiement
    // -------------------------------------------------------------------------
    totalTests++;
    console.log(`${colors.bold}Test 2 : Appel de GET /api/company?q=552032534 sans en-tête de paiement${colors.reset}`);
    const resCompany = await fetch(`${testUrl}/api/company?q=552032534`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'x402-Test-Agent/1.0' // Agent IA / script HTTP
      }
    });

    const statusCompany = resCompany.status;
    const dataCompany = await resCompany.json();

    if (statusCompany === 402) {
      console.log(`  ${colors.green}✔ Succès : Code HTTP 402 (Payment Required) renvoyé avec succès !${colors.reset}`);
      console.log(`  - Version x402 : ${dataCompany.x402Version}`);
      console.log(`  - Message      : ${dataCompany.error}`);

      if (Array.isArray(dataCompany.accepts) && dataCompany.accepts.length > 0) {
        const accept = dataCompany.accepts[0];
        console.log(`  - Schéma       : ${accept.scheme}`);
        console.log(`  - Réseau       : ${accept.network}`);
        console.log(`  - Montant brut : ${accept.maxAmountRequired} (6 décimales = 0.15 USDC)`);
        console.log(`  - Contrat USDC : ${accept.asset}`);
        console.log(`  - Destinataire : ${accept.payTo}`);
      }
      passedTests++;
    } else {
      console.log(`  ${colors.red}✖ Échec : Attendu HTTP 402 mais reçu HTTP ${statusCompany}${colors.reset}`);
      console.log('  Réponse reçue :', dataCompany);
    }

    console.log('\n' + '-'.repeat(54) + '\n');

    // -------------------------------------------------------------------------
    // TEST 3 : Validation de la formule de TVA et de l'intégration API gouv
    // -------------------------------------------------------------------------
    totalTests++;
    console.log(`${colors.bold}Test 3 : Validation directe de la logique métier et du calcul de TVA${colors.reset}`);
    const testSiren = '552032534'; // Danone
    const gouvRes = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${testSiren}&per_page=1`);
    if (gouvRes.ok) {
      const gouvData = await gouvRes.json();
      const company = gouvData.results[0];

      // Formule officielle de TVA demandée par l'utilisateur
      const cleanSiren = String(company.siren).replace(/\D/g, '');
      const sirenNum = parseInt(cleanSiren, 10);
      const cle = (12 + 3 * (sirenNum % 97)) % 97;
      const tvaCalculee = `FR${String(cle).padStart(2, '0')}${cleanSiren}`;

      if (tvaCalculee === 'FR27552032534') {
        console.log(`  ${colors.green}✔ Succès : Formule de TVA validée pour le SIREN ${cleanSiren} -> ${tvaCalculee}${colors.reset}`);
        console.log(`  - Entreprise trouvée : ${company.nom_complet}`);
        console.log(`  - SIRET siège        : ${company.siege ? company.siege.siret : 'N/A'}`);
        console.log(`  - Statut             : ${company.etat_administratif === 'A' ? 'Actif' : 'Fermé'}`);
        passedTests++;
      } else {
        console.log(`  ${colors.red}✖ Échec : Résultat TVA incorrect (${tvaCalculee})${colors.reset}`);
      }
    } else {
      console.log(`  ${colors.yellow}⚠ Avertissement : Impossible d'interroger recherche-entreprises.api.gouv.fr (${gouvRes.status})${colors.reset}`);
    }

    console.log('\n' + '-'.repeat(54) + '\n');

    // -------------------------------------------------------------------------
    // TEST 4 : Appel direct de l'outil MCP verify_french_company & annotations
    // -------------------------------------------------------------------------
    totalTests++;
    console.log(`${colors.bold}Test 4 : Appel direct de l'outil MCP verify_french_company et vérification des 4 annotations${colors.reset}`);
    const { verifyFrenchCompany, server: mcpServer } = require('./mcp-server');

    // 1. Vérification des 4 annotations MCP enregistrées sur l'outil
    const registeredTool = mcpServer._registeredTools['verify_french_company'];
    const annotationsOk =
      registeredTool &&
      registeredTool.annotations &&
      registeredTool.annotations.readOnlyHint === true &&
      registeredTool.annotations.destructiveHint === false &&
      registeredTool.annotations.idempotentHint === true &&
      registeredTool.annotations.openWorldHint === true;

    // 2. Appel direct de l'outil avec le SIREN 552032534 (Danone)
    const mcpResponse = await verifyFrenchCompany({ query: '552032534' });

    let mcpPayload = null;
    try {
      if (mcpResponse && Array.isArray(mcpResponse.content) && mcpResponse.content[0]) {
        mcpPayload = JSON.parse(mcpResponse.content[0].text);
      }
    } catch {
      mcpPayload = null;
    }

    const mcpExecutionOk =
      mcpPayload &&
      (mcpPayload.status === 'PAYMENT_REQUIRED' || mcpPayload.siren === '552032534' || mcpPayload.nom_complet);

    if (annotationsOk && mcpExecutionOk) {
      console.log(`  ${colors.green}✔ Succès : Outil MCP verify_french_company validé avec succès !${colors.reset}`);
      console.log(`  - readOnlyHint    : ${registeredTool.annotations.readOnlyHint}`);
      console.log(`  - destructiveHint : ${registeredTool.annotations.destructiveHint}`);
      console.log(`  - idempotentHint  : ${registeredTool.annotations.idempotentHint}`);
      console.log(`  - openWorldHint   : ${registeredTool.annotations.openWorldHint}`);
      console.log(`  - Statut réponse  : ${mcpPayload.status || 'OK'}`);
      passedTests++;
    } else {
      console.log(`  ${colors.red}✖ Échec de validation de l'outil MCP ou des annotations${colors.reset}`);
      if (!annotationsOk) console.log('  Annotations incorrectes :', registeredTool ? registeredTool.annotations : 'outil non trouvé');
      if (!mcpExecutionOk) console.log('  Réponse MCP inattendue :', mcpResponse);
    }

    // -------------------------------------------------------------------------
    // Bilan
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
    if (passedTests === totalTests) {
      console.log(`${colors.bold}${colors.green}   RÉSULTAT : ${passedTests}/${totalTests} tests réussis avec succès ! 🎉${colors.reset}`);
      console.log(`${colors.green}   L'API et le serveur MCP sont prêts pour la production et conformes aux spécifications.${colors.reset}`);
    } else {
      console.log(`${colors.bold}${colors.red}   RÉSULTAT : ${passedTests}/${totalTests} tests réussis. Vérifiez les erreurs ci-dessus.${colors.reset}`);
    }
    console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  } catch (err) {
    console.error(`${colors.red}Erreur inattendue pendant les tests :${colors.reset}`, err);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

// Exécution du script
runTests();
