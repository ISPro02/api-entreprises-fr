/**
 * =============================================================================
 * Micro-API Commerciale : Vérification des Entreprises Françaises
 * Monétisation : Protocole x402 (Micro-paiements USDC sur le réseau Base)
 * =============================================================================
 *
 * Cette API permet aux agents d'intelligence artificielle et aux développeurs
 * de vérifier et certifier l'existence légale d'une entreprise française en temps
 * réel à l'aide des données officielles de l'État (recherche-entreprises.api.gouv.fr).
 *
 * L'accès à la route `/api/company` nécessite un paiement direct de 0.15 USDC
 * validé automatiquement via le middleware de paiement x402.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { paymentMiddleware } = require('x402-express');

// Initialisation de l'application Express
const app = express();

// Configuration des middlewares globaux
app.use(cors());
app.use(express.json());

// Paramètres de configuration (avec valeurs par défaut sécurisées)
const PORT = process.env.PORT || 3000;
const NETWORK = process.env.NETWORK || 'base-sepolia';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0xB1b0f5a198D1a8344d32172f29D73fa3FaA74B4c';
const PRICE_USDC = process.env.PRICE_USDC || '0.15';

/**
 * Configuration du Middleware de paiement x402
 *
 * Protège spécifiquement la route `/api/company`.
 * Tout client (agent IA ou script HTTP) appelant cette route sans en-tête de paiement
 * valide recevra automatiquement un code HTTP 402 (Payment Required) contenant
 * les spécifications nécessaires au règlement (montant, token USDC, réseau, adresse).
 */
app.use(
  paymentMiddleware(WALLET_ADDRESS, {
    '/api/company': {
      price: `$${PRICE_USDC}`,
      network: NETWORK,
      config: {
        description: "Vérification certifiée d'entreprise française par SIREN ou dénomination",
        discoverable: true
      }
    }
  })
);

/**
 * Calcule le numéro de TVA intracommunautaire français à partir du numéro SIREN (9 chiffres).
 * Formule officielle française :
 * Clé TVA = (12 + 3 * (SIREN % 97)) % 97
 * Numéro TVA = FR + Clé (sur 2 chiffres) + SIREN
 *
 * @param {string|number} siren - Numéro SIREN de l'entreprise
 * @returns {string|null} Numéro de TVA intracommunautaire formaté ou null si SIREN invalide
 */
function calculerNumeroTVA(siren) {
  if (!siren) return null;
  const cleanSiren = String(siren).replace(/\D/g, '');
  if (cleanSiren.length !== 9) return null;

  const sirenNum = parseInt(cleanSiren, 10);
  const cle = (12 + 3 * (sirenNum % 97)) % 97;
  const cleFormatee = String(cle).padStart(2, '0');

  return `FR${cleFormatee}${cleanSiren}`;
}

/**
 * Formate l'adresse complète du siège social de l'entreprise.
 *
 * @param {object} siege - Objet siège retourné par l'API gouv
 * @returns {string} Adresse formatée
 */
function formaterAdresse(siege) {
  if (!siege) return 'Adresse non renseignée';
  if (siege.adresse) return siege.adresse;

  const elements = [
    siege.numero_voie,
    siege.type_voie,
    siege.nom_voie,
    siege.code_postal,
    siege.libelle_commune
  ].filter(Boolean);

  return elements.length > 0 ? elements.join(' ') : 'Adresse non renseignée';
}

/**
 * Formate et structure la liste des dirigeants de l'entreprise.
 *
 * @param {Array} dirigeants - Tableau des dirigeants retourné par l'API gouv
 * @returns {Array} Liste nettoyée des dirigeants
 */
function formaterDirigeants(dirigeants) {
  if (!Array.isArray(dirigeants) || dirigeants.length === 0) {
    return [];
  }

  return dirigeants.map((d) => {
    const isPersonneMorale = d.type_dirigeant === 'personne morale' || (!d.nom && d.denomination);

    if (isPersonneMorale) {
      return {
        type: 'personne morale',
        denomination: d.denomination || null,
        siren: d.siren || null,
        qualite: d.qualite || null
      };
    }

    return {
      type: 'personne physique',
      nom: d.nom || null,
      prenoms: d.prenoms || null,
      qualite: d.qualite || null,
      annee_de_naissance: d.annee_de_naissance || null,
      nationalite: d.nationalite || null
    };
  });
}

/**
 * Route publique et gratuite : GET /
 * Description complète de l'API, des tarifs et des exemples d'utilisation.
 */
app.get('/', (req, res) => {
  res.json({
    name: 'API Entreprises France - x402',
    description: "Micro-API commerciale prête pour la production permettant aux agents IA de vérifier et certifier les entreprises françaises en temps réel via les données officielles de l'État.",
    version: '1.0.0',
    pricing: {
      price: `${PRICE_USDC} USDC`,
      amount_usd: PRICE_USDC,
      currency: 'USDC',
      protocol: 'x402',
      network: NETWORK,
      wallet_address: WALLET_ADDRESS
    },
    endpoints: {
      'GET /': {
        access: 'gratuit',
        description: "Documentation générale et métadonnées de l'API"
      },
      'GET /api/company': {
        access: `payant (${PRICE_USDC} USDC via protocole x402)`,
        description: "Recherche et extraction certifiée des informations d'une entreprise par SIREN ou dénomination commerciale",
        query_parameters: {
          q: {
            type: 'string',
            required: true,
            description: "Numéro SIREN (9 chiffres) ou nom/raison sociale de l'entreprise (ex: 552032534 ou Danone)"
          }
        },
        example_usage: {
          url: '/api/company?q=552032534',
          behavior: 'Renvoie un statut HTTP 402 avec le challenge de paiement si aucun en-tête X-PAYMENT valide n\'est fourni.'
        }
      }
    }
  });
});

/**
 * Route commerciale payante : GET /api/company
 * Paramètre de requête : ?q=SIREN_OU_NOM
 *
 * Protégée par le middleware x402 (0.15 USDC sur Base).
 */
app.get('/api/company', async (req, res, next) => {
  try {
    const q = req.query.q;

    // Validation du paramètre obligatoire 'q'
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Le paramètre de requête 'q' (numéro SIREN ou nom de l'entreprise) est obligatoire."
      });
    }

    const searchTerm = q.trim();

    // Appel à l'API officielle de l'État français
    const apiUrl = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(searchTerm)}&per_page=1`;

    let apiResponse;
    try {
      apiResponse = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MicroAPI-Entreprises-x402/1.0'
        },
        signal: AbortSignal.timeout(10000) // Timeout de 10 secondes
      });
    } catch (networkError) {
      console.error("Erreur de connexion à l'API recherche-entreprises:", networkError);
      return res.status(502).json({
        error: 'Bad Gateway',
        message: "Impossible de contacter l'API publique de l'État français (recherche-entreprises.api.gouv.fr)."
      });
    }

    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({
        error: 'Upstream Error',
        message: `L'API gouvernementale a répondu avec le statut ${apiResponse.status}.`
      });
    }

    const data = await apiResponse.json();

    // Vérification de la présence de résultats
    if (!data.results || data.results.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Aucune entreprise trouvée pour le terme de recherche : '${searchTerm}'`
      });
    }

    // Récupération de l'entreprise la plus pertinente
    const company = data.results[0];

    // Détermination du statut de l'entreprise (A = Actif, C = Cessé / Fermé)
    const statut = company.etat_administratif === 'A' ? 'Actif' : 'Fermé';

    // Calcul automatique du numéro de TVA intracommunautaire officiel
    const numero_tva_intracommunautaire = calculerNumeroTVA(company.siren);

    // Formatage de l'adresse et des dirigeants
    const adresse = formaterAdresse(company.siege);
    const dirigeants = formaterDirigeants(company.dirigeants);

    // Construction de la réponse JSON conforme aux consignes
    const formattedResponse = {
      nom_complet: company.nom_complet || company.nom_raison_sociale || 'Nom inconnu',
      siren: company.siren || null,
      siret_siege: (company.siege && company.siege.siret) ? company.siege.siret : null,
      statut: statut,
      date_creation: company.date_creation || null,
      activite_principale: company.activite_principale || null,
      adresse: adresse,
      dirigeants: dirigeants,
      numero_tva_intracommunautaire: numero_tva_intracommunautaire
    };

    return res.status(200).json(formattedResponse);
  } catch (error) {
    next(error);
  }
});

// Middleware de gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur interne serveur:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Une erreur inattendue est survenue.'
  });
});

// Démarrage du serveur si exécuté directement
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`  Micro-API Entreprises Françaises (x402) démarrée `);
    console.log(`===================================================`);
    console.log(`- Port local      : http://localhost:${PORT}`);
    console.log(`- Réseau x402     : ${NETWORK}`);
    console.log(`- Tarif           : ${PRICE_USDC} USDC`);
    console.log(`- Wallet récepteur: ${WALLET_ADDRESS}`);
    console.log(`- Route libre     : GET http://localhost:${PORT}/`);
    console.log(`- Route payante   : GET http://localhost:${PORT}/api/company?q=552032534`);
    console.log(`===================================================`);
  });
}

module.exports = app;
