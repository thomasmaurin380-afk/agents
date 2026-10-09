#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Générateur des jeux de données FICTIFS de l'outil d'import comptable.

Toutes les données produites ici sont 100 % FICTIVES (client CLI-TEST,
SIREN fictif 123456789, sociétés inventées). Aucune donnée réelle.

Rôle : produire de façon reproductible les fichiers sources des scénarios
(encodages, BOM, CRLF, guillemets) à partir d'une table de conception
écrite à la main. Ce script NE CLASSE RIEN : les résultats attendus sont
écrits à la main dans ../attendus/*.json à partir des modifications
introduites volontairement (voir ../README.md).

Seule sortie « calculée » : attendus/S01_lignes_canoniques.json, qui est la
simple transcription de la table de conception S01 sous forme canonique
(comptes paddés à 8, dates ISO, centimes) — c'est la conception elle-même.

Usage : python3 -I generer.py   (depuis n'importe quel répertoire)
"""
import json
import os
import shutil

ICI = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.dirname(ICI)
SCN = os.path.join(FIX, "scenarios")
ATT = os.path.join(FIX, "attendus")

L = 8  # longueur de compte du client CLI-TEST
NBSP = " "
NNBSP = " "

JOURNAUX = {"VT": "Ventes", "AC": "Achats", "BQ": "Banque", "OD": "Opérations diverses"}

COMPTES = {
    "401": "Fournisseurs",
    "4011": "Fournisseurs divers",
    "40110": "Fournisseurs groupe",
    "401234567890": "Compte trop long fictif",
    "401DUPONT": "Fournisseur Dupont",
    "4081": "Fournisseurs - factures non parvenues",
    "411": "Clients",
    "421": "Personnel - rémunérations dues",
    "431": "Sécurité sociale",
    "44566": "TVA déductible sur ABS",
    "44571": "TVA collectée",
    "512": "Banque",
    "606100": "Fournitures non stockables",
    "607": "Achats de marchandises",
    "613200": "Locations immobilières",
    "6226": "Honoraires",
    "627800": "Frais bancaires",
    "641000": "Rémunérations du personnel",
    "645000": "Charges de sécurité sociale",
    "706000": "Prestations de services",
    "901": "Compte analytique fictif",
}

AUX = {
    "0012": "Dupont Fictif SARL",
    "0045": "Élan Conseil Fictif",
    "0078": "Bureau Fictif SAS",
    "0091": "Grossiste Fictif",
}

IMPORTRANGE = '=IMPORTRANGE("x","y")'


def ln(compte, d=0, c=0, aux="", let="", dlet=""):
    return {"compte": compte, "aux": aux, "d": d, "c": c, "let": let, "dlet": dlet}


def ecr(j, num, date, piece, lib, lignes, valid=None, piece_date=None):
    return {
        "j": j, "num": num, "date": date, "piece": piece, "lib": lib,
        "valid": date if valid is None else valid,
        "piece_date": date if piece_date is None else piece_date,
        "lignes": lignes,
    }


# ---------------------------------------------------------------------------
# S01 — conception (14 écritures / 36 lignes, janvier–mars 2026)
# ---------------------------------------------------------------------------
def s01():
    return [
        ecr("VT", "000120", "20260108", "F2026-001", "=1+1 Facture Dupont Fictif", [
            ln("411", d=60000, aux="0012", let="AA", dlet="20260131"),
            ln("706000", c=50000), ln("44571", c=10000)]),
        ecr("VT", "000121", "20260112", "F2026-002", "Prestation de conseil — été", [
            ln("411", d=240000, aux="0045"), ln("706000", c=200000), ln("44571", c=40000)]),
        ecr("VT", "000122", "20260114", "F2026-003", "+Facture complémentaire janvier", [
            ln("411", d=180000, aux="0045"), ln("706000", c=150000), ln("44571", c=30000)]),
        ecr("VT", "000123", "20260115", "F2026-004", "Facture Dupont janvier", [
            ln("411", d=120000, aux="0012"), ln("706000", c=100000), ln("44571", c=20000)]),
        ecr("AC", "000044", "20260120", "FA-7781", "@Achat fournitures bureau", [
            ln("606100", d=25000), ln("44566", d=5000), ln("401", c=30000, aux="0078")]),
        ecr("BQ", "000208", "20260131", "RB-0131", "Règlement Dupont F2026-001", [
            ln("512", d=60000), ln("411", c=60000, aux="0012", let="AA", dlet="20260131")]),
        ecr("AC", "000045", "20260210", "FA-9045", "Achat marchandises février", [
            ln("607", d=50000), ln("44566", d=10000), ln("401", c=60000, aux="0091")]),
        ecr("BQ", "000209", "20260215", "RB-0215", "Règlement Bureau Fictif", [
            ln("401", d=30000, aux="0078"), ln("512", c=30000)]),
        ecr("BQ", "000210", "20260220", "RB-0220", "Règlement facture Dupont", [
            ln("512", d=120000), ln("411", c=120000, aux="0012")]),
        ecr("OD", "000012", "20260228", "OD-0228", "Honoraires à recevoir février", [
            ln("6226", d=30000), ln("4081", c=30000)]),
        ecr("AC", "PROV-17", "20260305", "FA-1717", "Achat petit matériel", [
            ln("606100", d=30000), ln("401", c=30000, aux="0078")], valid=""),
        ecr("BQ", "000211", "20260305", "RB-0305", "Frais bancaires mars", [
            ln("627800", d=2500), ln("512", c=2500)]),
        ecr("BQ", "000212", "20260310", "RB-0310", "Virement Élan Conseil", [
            ln("512", d=240000), ln("411", c=240000, aux="0045")]),
        ecr("OD", "000013", "20260331", "PAIE-03", IMPORTRANGE, [
            ln("641000", d=300000), ln("645000", d=120000),
            ln("421", c=300000), ln("431", c=120000)]),
    ]


def trouve(ecrs, j, num):
    for e in ecrs:
        if e["j"] == j and e["num"] == num:
            return e
    raise KeyError(j + num)


def copie(e):
    return json.loads(json.dumps(e))


# Nouvelles écritures d'avril / mars partagées par S03 et S04
def ac_000052():
    return ecr("AC", "000052", "20260415", "FA-9152", "Achat fournitures avril", [
        ln("606100", d=15000), ln("44566", d=3000), ln("401", c=18000, aux="0078")])


def od_000014():
    return ecr("OD", "000014", "20260430", "PAIE-04", "Salaires avril", [
        ln("641000", d=300000), ln("645000", d=120000),
        ln("421", c=300000), ln("431", c=120000)])


# ---------------------------------------------------------------------------
# S03 — cumulatif janvier–avril (modifications volontaires, voir README)
# ---------------------------------------------------------------------------
def s03():
    b = s01()
    g = lambda j, n: copie(trouve(b, j, n))
    vt120 = g("VT", "000120")
    vt121 = g("VT", "000121")
    vt121["lib"] = "Prestation de conseil — été 2026"           # M_DESC
    vt122 = g("VT", "000122")
    vt122["lignes"][0].update(let="AE", dlet="20260412")      # M_LET
    vt123 = g("VT", "000123")
    vt123["lignes"][0].update(let="AB", dlet="20260220")      # M_LET
    ac044 = g("AC", "000044")
    ac044["lignes"][2].update(let="AC", dlet="20260215")      # M_LET
    bq208 = g("BQ", "000208")
    ac045 = g("AC", "000045")                                  # M_FOND
    ac045["lignes"][0]["d"] = 55000
    ac045["lignes"][1]["d"] = 11000
    ac045["lignes"][2]["c"] = 66000
    bq209 = g("BQ", "000209")
    bq209["lignes"][0].update(let="AC", dlet="20260215")      # M_LET
    bq210 = g("BQ", "000210")
    bq210["lignes"][1].update(let="AB", dlet="20260220")      # M_LET
    # OD 000012 et AC PROV-17 retirées (ABSENTE)
    ac051 = ecr("AC", "000051", "20260305", "FA-1717", "Achat petit matériel", [
        ln("606100", d=30000), ln("401", c=30000, aux="0078")], valid="20260310")
    loyer = lambda n: ecr("BQ", n, "20260305", "LOY-03", "Loyer mars", [
        ln("613200", d=150000), ln("512", c=150000)])
    bq211 = g("BQ", "000211")
    bq211["date"] = "20260304"                                 # M_DATE seul
    bq211["piece_date"] = "20260305"
    bq211["valid"] = "20260305"
    bq212 = g("BQ", "000212")
    od013 = g("OD", "000013")
    vt124 = ecr("VT", "000124", "20260410", "F2026-005", "Facture Dupont avril", [
        ln("411", d=96000, aux="0012"), ln("706000", c=80000), ln("44571", c=16000)])
    bq215 = ecr("BQ", "000215", "20260412", "RB-0412", "Règlement Élan Conseil F2026-003", [
        ln("512", d=180000), ln("411", c=180000, aux="0045", let="AE", dlet="20260412")])
    return [vt120, vt121, vt122, vt123, ac044, bq208, ac045, bq209, bq210,
            ac051, loyer("000301"), loyer("000302"), bq211, bq212, od013,
            vt124, bq215, copie(vt124), ac_000052(), od_000014()]


def s04():
    b = s01()
    g = lambda j, n: copie(trouve(b, j, n))
    return [g("AC", "PROV-17"), g("BQ", "000211"), None,  # None = ligne vide
            g("BQ", "000212"), g("OD", "000013"), ac_000052(), od_000014()]


def s05():
    return [
        ecr("VT", "000130", "20260105", "F2026-010", "Facture Dupont", [
            ln("411", d=120000, aux="0012"), ln("706000", c=100000), ln("44571", c=20000)]),
        ecr("AC", "000060", "20260112", "FA-6060", "Achat fournitures", [
            ln("606100", d=10000), ln("44566", d=2000), ln("401", c=12000, aux="0078")]),
        ecr("VT", "000130", "20260105", "F2026-011", "Facture Élan", [
            ln("411", d=60000, aux="0045"), ln("706000", c=50000), ln("44571", c=10000)]),
        # BQ 000220 : 2 lignes contiguës portant 2 dates différentes
        {"j": "BQ", "num": "000220", "date": None, "piece": "RB-0110",
         "lib": "Règlement Dupont", "valid": "20260111", "piece_date": "20260110",
         "lignes": [dict(ln("512", d=50000), date="20260110"),
                    dict(ln("411", c=50000, aux="0012"), date="20260111")]},
    ]


def s06():
    return [
        ecr("VT", "000140", "20260120", "F2026-020", "Facture Dupont", [
            ln("411", d=120001, aux="0012"), ln("706000", c=100000), ln("44571", c=20000)]),
        ecr("BQ", "000230", "20260125", "RB-0125", "Règlement Dupont", [
            ln("512", d=50000), ln("411", c=50000, aux="0012")]),
        ecr("AC", "000070", "20260128", "FA-7070", "Achat fournitures", [
            ln("606100", d=10000), ln("44566", d=2000), ln("401", c=12000, aux="0078")]),
    ]


def s08_base():
    return [
        ecr("VT", "000501", "20251105", "F2025-501", "Facture Dupont novembre", [
            ln("411", d=180000, aux="0012"), ln("706000", c=150000), ln("44571", c=30000)]),
        ecr("AC", "000301", "20251110", "FA-5301", "Achat marchandises novembre", [
            ln("607", d=40000), ln("44566", d=8000), ln("401", c=48000, aux="0091")]),
        ecr("BQ", "000601", "20251215", "RB-1215", "Règlement Dupont F2025-501", [
            ln("512", d=180000), ln("411", c=180000, aux="0012")]),
        ecr("OD", "000201", "20251231", "OD-1231", "Honoraires à recevoir 2025", [
            ln("6226", d=25000), ln("4081", c=25000)]),
    ]


def s08_import():
    b = s08_base()
    b[0]["lignes"][0].update(let="AA", dlet="20251215")   # VT 000501 : M_LET
    b[1]["lignes"][0]["d"] = 45000                         # AC 000301 : M_FOND
    b[1]["lignes"][1]["d"] = 9000
    b[1]["lignes"][2]["c"] = 54000
    b[2]["lignes"][1].update(let="AA", dlet="20251215")   # BQ 000601 : M_LET
    return b


def s09():
    return [
        ecr("AC", "000080", "20260115", "FA-8080", "Achat fournitures divers", [
            ln("606100", d=10000), ln("44566", d=2000), ln("4011", c=12000)]),
        ecr("AC", "000081", "20260116", "FA-8081", "Achat fournitures groupe", [
            ln("606100", d=5000), ln("44566", d=1000), ln("40110", c=6000)]),
        ecr("OD", "000090", "20260120", "OD-0120", "Reclassement fournisseur", [
            ln("401234567890", d=10000), ln("401DUPONT", c=10000)]),
        ecr("OD", "000091", "20260125", "OD-0125", "Écriture analytique", [
            ln("901", d=30000), ln("512", c=30000)]),
    ]


# ---------------------------------------------------------------------------
# Mise en forme
# ---------------------------------------------------------------------------
FEC_ENTETE = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum",
              "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate",
              "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate",
              "Montantdevise", "Idevise"]
FEC_MS_ENTETE = FEC_ENTETE[:11] + ["Montant", "Sens"] + FEC_ENTETE[13:]
GL_ENTETE = ["Compte", "Libellé compte", "Date", "Journal", "N° écriture", "Pièce",
             "Libellé", "Débit", "Crédit", "Lettrage"]


def mnt(cts):
    return "%d,%02d" % (cts // 100, cts % 100)


def mnt_milliers(cts, sep):
    e, c = cts // 100, cts % 100
    s = "{:,}".format(e).replace(",", sep)
    return "%s,%02d" % (s, c)


def champ(v, sep):
    if '"' in v or sep in v or "\n" in v or "\r" in v:
        return '"' + v.replace('"', '""') + '"'
    return v


def iso(d):
    return "" if not d else "%s-%s-%s" % (d[0:4], d[4:6], d[6:8])


def jjmmaaaa(d):
    return "%s/%s/%s" % (d[6:8], d[4:6], d[0:4])


def lignes_fec(ecrs, montant_sens=False):
    out = []
    for e in ecrs:
        if e is None:
            out.append(None)
            continue
        for l in e["lignes"]:
            date = l.get("date") or e["date"]
            base = [e["j"], JOURNAUX[e["j"]], e["num"], date, l["compte"],
                    COMPTES[l["compte"]], l["aux"], AUX.get(l["aux"], ""), e["piece"],
                    e["piece_date"], e["lib"]]
            if montant_sens:
                sens = "D" if l["d"] else "C"
                mid = [mnt(l["d"] or l["c"]), sens]
            else:
                mid = [mnt(l["d"]), mnt(l["c"])]
            fin = [l["let"], l["dlet"], e["valid"], "", ""]
            out.append(base + mid + fin)
    return out


def serialise(entete, lignes, sep="\t", eol="\n"):
    txt = [sep.join(champ(v, sep) for v in entete)]
    for r in lignes:
        txt.append("" if r is None else sep.join(champ(v, sep) for v in r))
    return eol.join(txt) + eol


def ecrire(chemin, octets):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "wb") as f:
        f.write(octets)


def compte_norm(c):
    return c + "0" * (L - len(c))


# ---------------------------------------------------------------------------
# Grand livre GL_TEST (trié par compte)
# ---------------------------------------------------------------------------
def lignes_gl(ecrs, avec_numero=True, numero_vide=False):
    plat = []
    for e in ecrs:
        for i, l in enumerate(e["lignes"]):
            plat.append((compte_norm(l["compte"]), e["date"], e["j"], e["num"], i, e, l))
    plat.sort(key=lambda t: t[:5])
    out = []
    for _, _, _, _, _, e, l in plat:
        def fmt(cts):
            if cts == 0:
                return ""
            if e["j"] == "OD" and e["num"] == "000013":
                return mnt_milliers(cts, NNBSP)          # U+202F
            return mnt_milliers(cts, NBSP)              # U+00A0 (si >= 1000)
        deb, cre = fmt(l["d"]), fmt(l["c"])
        if e["j"] == "BQ" and e["num"] == "000211":
            # montants négatifs portés dans la colonne opposée
            if l["d"]:
                deb, cre = "", "(" + mnt(l["d"]) + ")"
            else:
                deb, cre = mnt(l["c"]) + "-", ""
        let = l["let"]
        if not let and ((e["j"], e["num"]) in (("BQ", "000210"), ("AC", "000045"))) \
                and l["compte"] in ("411", "401"):
            let = "0"                                  # lettrage vide déclaré "0"
        num = "" if numero_vide else e["num"]
        r = [l["compte"], COMPTES[l["compte"]], jjmmaaaa(e["date"]), e["j"]]
        r += ([num] if avec_numero else [])
        r += [e["piece"], e["lib"], deb, cre, let]
        out.append(r)
    return out


# ---------------------------------------------------------------------------
# Lignes canoniques attendues de S01 (transcription de la conception)
# ---------------------------------------------------------------------------
def canoniques(ecrs):
    res = []
    rang = 0
    for e in ecrs:
        for l in e["lignes"]:
            rang += 1
            res.append({
                "rang": rang,
                "cle": "%s|%s" % (e["j"], e["num"]),
                "journal_code": e["j"], "journal_lib": JOURNAUX[e["j"]],
                "ecriture_num": e["num"], "ecriture_date": iso(e["date"]),
                "compte_num": compte_norm(l["compte"]), "compte_num_source": l["compte"],
                "compte_lib": COMPTES[l["compte"]],
                "comp_aux_num": l["aux"], "comp_aux_lib": AUX.get(l["aux"], ""),
                "piece_ref": e["piece"], "piece_date": iso(e["piece_date"]),
                "ecriture_lib": e["lib"],
                "debit_cts": l["d"], "credit_cts": l["c"],
                "ecriture_let": l["let"], "date_let": iso(l["dlet"]),
                "valid_date": iso(e["valid"]),
                "montant_devise_cts": None, "idevise": "",
            })
    return res


def main():
    if os.path.isdir(SCN):
        shutil.rmtree(SCN)
    nom = "123456789FEC20260331.txt"

    # S01
    t01 = serialise(FEC_ENTETE, lignes_fec(s01()))
    ecrire(os.path.join(SCN, "S01", nom), t01.encode("utf-8"))

    # S02 (a) mêmes octets ; (b) écritures en ordre inverse, lignes inversées
    # dans VT 000120 et OD 000013, fins de ligne CRLF
    ecrire(os.path.join(SCN, "S02", "a_memes_octets", nom), t01.encode("utf-8"))
    rev = [copie(e) for e in reversed(s01())]
    for e in rev:
        if (e["j"], e["num"]) in (("VT", "000120"), ("OD", "000013")):
            e["lignes"].reverse()
    ecrire(os.path.join(SCN, "S02", "b_reordonne_crlf", nom),
           serialise(FEC_ENTETE, lignes_fec(rev), eol="\r\n").encode("utf-8"))

    # S03, S04
    ecrire(os.path.join(SCN, "S03", "123456789FEC20260430.txt"),
           serialise(FEC_ENTETE, lignes_fec(s03())).encode("utf-8"))
    ecrire(os.path.join(SCN, "S04", "123456789FEC20260430.txt"),
           serialise(FEC_ENTETE, lignes_fec(s04())).encode("utf-8"))

    # S05, S06
    ecrire(os.path.join(SCN, "S05", nom),
           serialise(FEC_ENTETE, lignes_fec(s05())).encode("utf-8"))
    ecrire(os.path.join(SCN, "S06", nom),
           serialise(FEC_ENTETE, lignes_fec(s06())).encode("utf-8"))

    # S07 encodages / formats
    ecrire(os.path.join(SCN, "S07", "a_utf8_bom", nom), b"\xef\xbb\xbf" + t01.encode("utf-8"))
    ecrire(os.path.join(SCN, "S07", "b_cp1252", nom), t01.encode("cp1252"))
    double = t01.encode("utf-8").decode("cp1252").encode("utf-8")
    ecrire(os.path.join(SCN, "S07", "c_double_encodage", nom), double)
    ecrire(os.path.join(SCN, "S07", "d_montant_sens", nom),
           serialise(FEC_MS_ENTETE, lignes_fec(s01(), montant_sens=True)).encode("utf-8"))

    # S08 clôture 2025
    n25 = "123456789FEC20251231.txt"
    ecrire(os.path.join(SCN, "S08", "base", n25),
           serialise(FEC_ENTETE, lignes_fec(s08_base())).encode("utf-8"))
    ecrire(os.path.join(SCN, "S08", "import", n25),
           serialise(FEC_ENTETE, lignes_fec(s08_import())).encode("utf-8"))

    # S09 comptes
    ecrire(os.path.join(SCN, "S09", nom),
           serialise(FEC_ENTETE, lignes_fec(s09())).encode("utf-8"))

    # S10 isolation : mêmes octets, deux noms de fichiers (SIREN A et B)
    ecrire(os.path.join(SCN, "S10", "A", "111111111FEC20260331.txt"), t01.encode("utf-8"))
    ecrire(os.path.join(SCN, "S10", "B", "222222222FEC20260331.txt"), t01.encode("utf-8"))

    # S11 grand livre
    gl = lignes_gl(s01())
    ecrire(os.path.join(SCN, "S11", "a_gl_avec_numero", "GL_TEST_2026T1.csv"),
           serialise(GL_ENTETE, gl, sep=";").encode("utf-8"))
    ent_sans = [h for h in GL_ENTETE if h != "N° écriture"]
    ecrire(os.path.join(SCN, "S11", "b1_gl_sans_colonne_numero", "GL_TEST_2026T1.csv"),
           serialise(ent_sans, lignes_gl(s01(), avec_numero=False), sep=";").encode("utf-8"))
    ecrire(os.path.join(SCN, "S11", "b2_gl_numero_vide", "GL_TEST_2026T1.csv"),
           serialise(GL_ENTETE, lignes_gl(s01(), numero_vide=True), sep=";").encode("utf-8"))
    nb401 = sum(1 for r in gl if r[0] == "401")
    assert all(r[0] == "401" for r in gl[:nb401]), "401 doit être le premier compte"
    total = ["Total compte 401", "", "", "", "", "", "",
             mnt_milliers(30000, NBSP), mnt_milliers(120000, NBSP), ""]
    glc = gl[:nb401] + [total] + gl[nb401:]
    ecrire(os.path.join(SCN, "S11", "c_gl_ligne_total", "GL_TEST_2026T1.csv"),
           serialise(GL_ENTETE, glc, sep=";").encode("utf-8"))
    ecrire(os.path.join(SCN, "S11", "d_fec_apres_gl", nom), t01.encode("utf-8"))

    # Lignes canoniques de référence S01
    with open(os.path.join(ATT, "S01_lignes_canoniques.json"), "w", encoding="utf-8") as f:
        json.dump({
            "description": "FICTIF — lignes canoniques attendues de S01 (transcription de la "
                           "table de conception, ordre du fichier). Textes absents = \"\", "
                           "montant devise absent = null. ecriture_lib = valeur d'origine "
                           "(la neutralisation des formules est faite à l'écriture dans Sheets "
                           "et la relecture doit restituer cette valeur).",
            "lignes": canoniques(s01()),
        }, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("Fichiers générés dans", SCN)


if __name__ == "__main__":
    main()
