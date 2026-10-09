/**
 * Adaptateur Apps Script du port Hasher : SHA-256 du texte encodé en UTF-8, en hexadécimal minuscule.
 * Utilities.computeDigest renvoie des octets signés (-128..127) : conversion explicite en hexadécimal.
 * L'égalité avec les vecteurs de référence est vérifiée par Empreinte.verifierHasher à chaque cas d'usage.
 */
var HasherGas = {
  sha256Hex: function (texte) {
    var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texte), Utilities.Charset.UTF_8);
    var hex = '';
    for (var i = 0; i < octets.length; i++) {
      var h = (octets[i] & 0xff).toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex;
  }
};
