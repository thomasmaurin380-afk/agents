/**
 * Adaptateur Node du port Hasher (SHA-256 hexadécimal, entrée encodée en UTF-8).
 * L'équivalent Apps Script utilisera Utilities.computeDigest (égalité bit à bit à vérifier, spike SP2).
 */
'use strict';

const crypto = require('node:crypto');

const hasherNode = {
  sha256Hex(texte) {
    return crypto.createHash('sha256').update(String(texte), 'utf8').digest('hex');
  },
  sha256HexOctets(octets) {
    return crypto.createHash('sha256').update(octets).digest('hex');
  }
};

module.exports = hasherNode;
