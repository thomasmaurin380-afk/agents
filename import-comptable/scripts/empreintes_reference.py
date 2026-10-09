#!/usr/bin/env python3
"""Empreintes de référence, implémentation indépendante du moteur JavaScript.

Écrite d'après le contrat d'interface (§5) et non d'après le code :
  H(nom, valeurs) = "v1:" + sha256_hex_utf8("v1:" + nom + US + US.join(valeurs))
  valeurs : chaîne telle quelle, entier en base 10, None -> "", booléen -> "1"/"0".
Entrée : test/fixtures/attendus/S01_lignes_canoniques.json (lignes canoniques de l'ingénieur).
Sortie : test/fixtures/attendus/S01_empreintes_reference.json
Usage : python3 -I scripts/empreintes_reference.py
"""
import hashlib
import json
import os

US = "\x1f"
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATT = os.path.join(RACINE, "test", "fixtures", "attendus")


def valeur(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if not isinstance(v, str) or US in v:
        raise ValueError("valeur non sérialisable")
    return v


def H(nom, valeurs):
    texte = "v1:" + nom + US + US.join(valeur(v) for v in valeurs)
    return "v1:" + hashlib.sha256(texte.encode("utf-8")).hexdigest()


FOND = ["compte_num", "comp_aux_num", "debit_cts", "credit_cts", "idevise", "montant_devise_cts"]
DESC = ["ecriture_lib", "piece_ref", "piece_date", "journal_lib", "compte_lib", "comp_aux_lib", "valid_date"]
LET = ["ecriture_let", "date_let"]


def main():
    with open(os.path.join(ATT, "S01_lignes_canoniques.json"), encoding="utf-8") as f:
        lignes = json.load(f)["lignes"]
    res = []
    for l in lignes:
        res.append({
            "rang": l["rang"],
            "cle": l["cle"],
            "h_fond": H("h_fond", [l[k] for k in FOND]),
            "h_desc": H("h_desc", [l[k] for k in DESC]),
            "h_let": H("h_let", [l[k] for k in LET]),
        })
    # h_ecr = H("ecriture", [cle_ecriture, ecriture_date] + liste triée des h_fond+h_desc+h_let)
    ecritures = {}
    for l, r in zip(lignes, res):
        ecritures.setdefault(l["cle"], {"date": l["ecriture_date"], "items": []})["items"].append(r["h_fond"] + r["h_desc"] + r["h_let"])
    h_ecr = {}
    for cle, e in ecritures.items():
        journal, num = cle.split("|", 1)
        cle_complete = "|".join(["CLI-TEST", "2026", journal, num])
        h_ecr[cle] = H("ecriture", [cle_complete, e["date"]] + sorted(e["items"]))
    sortie = {
        "description": "FICTIF — empreintes de référence de S01, calculées en Python d'après le contrat §5 "
                       "(implémentation indépendante du moteur JavaScript).",
        "client_id": "CLI-TEST",
        "exercice_id": "2026",
        "lignes": res,
        "h_ecr": h_ecr,
    }
    with open(os.path.join(ATT, "S01_empreintes_reference.json"), "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("%d lignes, %d écritures" % (len(res), len(h_ecr)))


if __name__ == "__main__":
    main()
