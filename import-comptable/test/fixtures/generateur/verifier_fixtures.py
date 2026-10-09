#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vérification STRUCTURELLE des jeux fictifs contre les attendus écrits à la main.

Ce script ne classe pas les écritures (pas de NOUVELLE / MODIFIEE…) : il
contrôle seulement que les attendus rédigés à la main sont cohérents avec
les fichiers générés, sur des grandeurs mécaniques :
  - nombre d'enregistrements lus et de lignes vides ;
  - ΣD / ΣC du fichier (toutes lignes lisibles) ;
  - nombre de lignes dont une valeur texte commence par = + - @ ;
  - Σ des variations de soldes = 0 ;
  - octets identiques là où le scénario l'exige ;
  - S01_lignes_canoniques cohérent avec le fichier S01 (comptes paddés, dates, centimes).

Usage : python3 -I verifier_fixtures.py   → code retour 0 si tout est conforme.
"""
import csv
import io
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.dirname(ICI)
ATT = os.path.join(FIX, "attendus")
ECHECS = []


def ok(cond, msg):
    print(("  OK   " if cond else "  ECHEC ") + msg)
    if not cond:
        ECHECS.append(msg)


def lire(chemin, profil):
    brut = open(os.path.join(FIX, chemin), "rb").read()
    enc = "cp1252" if profil["encodage"] == "windows-1252" else "utf-8-sig"
    txt = brut.decode(enc)
    sep = profil["separateur"]
    lignes = txt.splitlines()
    entete = next(csv.reader([lignes[0]], delimiter=sep))
    recs = []
    for l in lignes[1:]:
        if l == "":
            recs.append(None)
        else:
            recs.append(next(csv.reader([l], delimiter=sep)))
    return entete, recs


def cts(v):
    v = v.replace(" ", "").replace(" ", "").replace(" ", "")
    if v == "":
        return 0
    neg = False
    if v.startswith("(") and v.endswith(")"):
        neg, v = True, v[1:-1]
    if v.endswith("-"):
        neg, v = True, v[:-1]
    e, d = v.split(",")
    n = int(e) * 100 + int(d.ljust(2, "0"))
    return -n if neg else n


def sommes(entete, recs, profil):
    inv = {k: v for k, v in profil["colonnes"].items()}
    idx = {inv[h]: i for i, h in enumerate(entete) if h in inv}
    D = C = 0
    for r in recs:
        if r is None:
            continue
        try:
            if profil["mode_sens"] == "MONTANT_SENS":
                m = cts(r[idx["montant"]])
                if r[idx["sens"]] == "D":
                    D += m
                else:
                    C += m
            else:
                d, c = cts(r[idx["debit"]]), cts(r[idx["credit"]])
                # signe conservé : montant = d − c ; D/C recalculés
                m = d - c
                D += max(m, 0)
                C += max(-m, 0)
        except (ValueError, KeyError, IndexError):
            pass
    return D, C


def nb_formules(entete, recs, profil):
    textes = [i for i, h in enumerate(entete)
              if profil["colonnes"].get(h) in ("ecriture_lib", "compte_lib", "comp_aux_lib",
                                                "journal_lib", "piece_ref")]
    n = 0
    for r in recs:
        if r and any(r[i][:1] in ("=", "+", "-", "@") for i in textes if i < len(r)):
            n += 1
    return n


def main():
    for nom in sorted(os.listdir(ATT)):
        if not nom.endswith(".json") or nom.startswith("S01_"):
            continue
        a = json.load(open(os.path.join(ATT, nom), encoding="utf-8"))
        att = a["attendu"]
        print(a["id"])
        profil = json.load(open(os.path.join(FIX, a["profil"]), encoding="utf-8"))
        for v in [k for k in att if k.startswith("variations_soldes")]:
            ok(sum(att[v].values()) == 0, "%s : Σ = 0" % v)
        if a["id"] == "S07c":
            brut = open(os.path.join(FIX, a["fichier"]), "rb").read().decode("utf-8")
            ok("Ã©" in brut and "Ã‰" in brut, "double encodage présent (Ã©, Ã‰)")
            continue
        entete, recs = lire(a["fichier"], profil)
        cl = att.get("compteurs_lignes")
        if cl:
            ok(cl["lues"] == len(recs), "lues %d (fichier %d)" % (cl["lues"], len(recs)))
            ok(cl["vides"] == sum(1 for r in recs if r is None), "vides %d" % cl["vides"])
            ok(cl["lues"] == cl["importees"] + cl["rejetees"] + cl["vides"] + cl["doublons_ignores"],
               "REC_LIGNES lues = importées + rejetées + vides + doublons")
        D, C = sommes(entete, recs, profil)
        tf = att.get("totaux_fichier")
        t = att.get("totaux")
        if tf:
            ok((tf["debit_cts"], tf["credit_cts"]) == (D, C), "totaux_fichier %s (fichier %d/%d)" % (tf, D, C))
        elif t and cl and cl["rejetees"] == 0 and cl["doublons_ignores"] == 0:
            ok((t["debit_cts"], t["credit_cts"]) == (D, C), "totaux %s (fichier %d/%d)" % (t, D, C))
        sec = [i for i in att.get("infos", []) if i["code"] == "SEC_NEUTRALISE"]
        if sec:
            n = nb_formules(entete, recs, profil)
            ok(sec[0]["nb_lignes"] == n, "SEC_NEUTRALISE %d (fichier %d)" % (sec[0]["nb_lignes"], n))

    # Octets identiques exigés
    s01 = open(os.path.join(FIX, "scenarios/S01/123456789FEC20260331.txt"), "rb").read()
    for p in ["scenarios/S02/a_memes_octets/123456789FEC20260331.txt",
              "scenarios/S10/A/111111111FEC20260331.txt",
              "scenarios/S10/B/222222222FEC20260331.txt",
              "scenarios/S11/d_fec_apres_gl/123456789FEC20260331.txt"]:
        ok(open(os.path.join(FIX, p), "rb").read() == s01, "octets identiques à S01 : " + p)
    s02b = open(os.path.join(FIX, "scenarios/S02/b_reordonne_crlf/123456789FEC20260331.txt"), "rb").read()
    ok(s02b.count(b"\r\n") == 37 and s02b != s01, "S02b : 37 fins de ligne CRLF, octets différents")
    ok(open(os.path.join(FIX, "scenarios/S07/a_utf8_bom/123456789FEC20260331.txt"), "rb").read()
       == b"\xef\xbb\xbf" + s01, "S07a = BOM + S01")

    # Lignes canoniques S01 vs fichier
    can = json.load(open(os.path.join(ATT, "S01_lignes_canoniques.json"), encoding="utf-8"))["lignes"]
    prof = json.load(open(os.path.join(FIX, "profils/FEC_GENERIQUE.json"), encoding="utf-8"))
    ent, recs = lire("scenarios/S01/123456789FEC20260331.txt", prof)
    ok(len(can) == len(recs) == 36, "S01 : 36 lignes canoniques")
    ecarts = 0
    for c, r in zip(can, recs):
        f = dict(zip(ent, r))
        iso = lambda d: "" if not d else "%s-%s-%s" % (d[:4], d[4:6], d[6:])
        exp = (f["JournalCode"], f["EcritureNum"], iso(f["EcritureDate"]),
               (f["CompteNum"] + "00000000")[:8], f["CompAuxNum"], f["EcritureLib"],
               cts(f["Debit"]), cts(f["Credit"]), f["EcritureLet"], iso(f["ValidDate"]))
        got = (c["journal_code"], c["ecriture_num"], c["ecriture_date"], c["compte_num"],
               c["comp_aux_num"], c["ecriture_lib"], c["debit_cts"], c["credit_cts"],
               c["ecriture_let"], c["valid_date"])
        ecarts += exp != got
    ok(ecarts == 0, "S01 : lignes canoniques = fichier (%d écart)" % ecarts)
    ok(len({c["cle"] for c in can}) == 14, "S01 : 14 clés distinctes")

    print("\n%s" % ("TOUT CONFORME" if not ECHECS else "%d ÉCHEC(S)" % len(ECHECS)))
    sys.exit(1 if ECHECS else 0)


if __name__ == "__main__":
    main()
