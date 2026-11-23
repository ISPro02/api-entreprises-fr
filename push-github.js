/**
 * Script de push automatique vers GitHub utilisant isomorphic-git
 *
 * Utilisation :
 *   node push-github.js <TON_PERSONAL_ACCESS_TOKEN_GITHUB>
 * ou
 *   $env:GITHUB_TOKEN="ghp_..."; node push-github.js
 */

const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');

async function push() {
  const token = process.argv[2] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (!token) {
    console.error('\x1b[31mErreur : Aucun token GitHub fourni.\x1b[0m');
    console.log('Utilisation : node push-github.js <TON_GITHUB_PERSONAL_ACCESS_TOKEN>');
    process.exit(1);
  }

  console.log('\x1b[36mEnvoi du code vers GitHub (branche main)...\x1b[0m');

  try {
    const pushResult = await git.push({
      fs,
      http,
      dir: '.',
      remote: 'origin',
      ref: 'main',
      onAuth: () => ({ username: token, password: '' })
    });

    if (pushResult.ok) {
      console.log('\x1b[32m✔ Projet poussé avec succès sur https://github.com/ISPro02/api-entreprises-fr.git !\x1b[0m');
    } else {
      console.log('Résultat du push :', pushResult);
    }
  } catch (err) {
    console.error('\x1b[31mÉchec du push :\x1b[0m', err.message);
  }
}

push();
