/**
 * Adaptateur Node de lecture de fichiers : octets, empreinte SHA-256 des octets bruts,
 * décodage selon l'encodage imposé par le profil.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const hasher = require('./hasher');

const ENCODAGES = ['UTF-8', 'windows-1252'];

// Octets 0x80–0x9F de windows-1252 (norme WHATWG). Constat du prototype : sous Node 22, TextDecoder
//('windows-1252') décode ces octets comme ISO-8859-1 (caractères de contrôle C1 au lieu de €, —, …).
// Le décodage est donc fait ici, sans dépendre de l'ICU. Les 5 positions non définies donnent U+FFFD,
// ce qui déclenche STR_ENCODAGE.
const CP1252_80_9F = [
  0x20AC, 0xFFFD, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0xFFFD, 0x017D, 0xFFFD,
  0xFFFD, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0xFFFD, 0x017E, 0x0178
];

function decoderWindows1252(octets) {
  let texte = '';
  for (let i = 0; i < octets.length; i += 8192) {
    const morceau = octets.subarray(i, i + 8192);
    const codes = new Array(morceau.length);
    for (let k = 0; k < morceau.length; k++) {
      const o = morceau[k];
      codes[k] = o >= 0x80 && o <= 0x9F ? CP1252_80_9F[o - 0x80] : o;
    }
    texte += String.fromCharCode.apply(null, codes);
  }
  return texte;
}

/**
 * @param {Uint8Array} octets
 * @param {'UTF-8'|'windows-1252'} encodage
 */
function decoder(octets, encodage) {
  if (encodage === 'windows-1252') return decoderWindows1252(octets);
  if (encodage === 'UTF-8') {
    // ignoreBOM: true conserve le BOM dans le texte ; le parseur CSV le retire et le signale.
    return new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(octets);
  }
  throw new Error(`Encodage non supporté : ${encodage}`);
}

/**
 * @param {string} chemin
 * @param {string} encodage 'UTF-8' | 'windows-1252'
 * @returns {{nomFichier: string, octets: Buffer, sha256: string, texte: string, taille: number}}
 */
function lireFichier(chemin, encodage) {
  if (!ENCODAGES.includes(encodage)) throw new Error(`Encodage non supporté : ${encodage}`);
  const octets = fs.readFileSync(chemin);
  const texte = decoder(octets, encodage);
  return {
    nomFichier: path.basename(chemin),
    octets,
    sha256: hasher.sha256HexOctets(octets),
    texte,
    taille: octets.length
  };
}

function lireJson(chemin) {
  return JSON.parse(fs.readFileSync(chemin, 'utf8'));
}

module.exports = { lireFichier, lireJson, decoder };
