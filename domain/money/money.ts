import Decimal from "decimal.js";

/**
 * Montant monétaire exact (jamais de flottant JS). Politique d'arrondi : au centime,
 * demi à l'écart de zéro (ROUND_HALF_UP), appliquée uniquement via `roundToCents()`.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Currency = "EUR";

const DB_AMOUNT = /^-?\d{1,16}(\.\d{1,2})?$/;

export class Money {
  private constructor(
    private readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static zero(currency: Currency = "EUR"): Money {
    return new Money(new D(0), currency);
  }

  /** Valeur `numeric(18,2)` lue en base (chaîne). Rejette toute autre représentation. */
  static fromDb(value: string, currency: Currency = "EUR"): Money {
    if (!DB_AMOUNT.test(value)) throw new RangeError(`Montant invalide : « ${value} »`);
    return new Money(new D(value), currency);
  }

  /** Montant exprimé en centimes entiers. */
  static fromCents(cents: bigint | number, currency: Currency = "EUR"): Money {
    if (typeof cents === "number" && !Number.isSafeInteger(cents)) {
      throw new RangeError("Centimes non entiers");
    }
    return new Money(new D(cents.toString()).div(100), currency);
  }

  private same(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Devises incompatibles : ${this.currency} / ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.same(other);
    return new Money(this.amount.add(other.amount), this.currency);
  }

  sub(other: Money): Money {
    this.same(other);
    return new Money(this.amount.sub(other.amount), this.currency);
  }

  neg(): Money {
    return new Money(this.amount.neg(), this.currency);
  }

  /** Multiplie par un taux exact (chaîne décimale) ; le résultat n'est pas arrondi. */
  mul(rate: string): Money {
    return new Money(this.amount.mul(new D(rate)), this.currency);
  }

  roundToCents(): Money {
    return new Money(this.amount.toDecimalPlaces(2, D.ROUND_HALF_UP), this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  compare(other: Money): -1 | 0 | 1 {
    this.same(other);
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  /** Représentation pour `numeric(18,2)` : exige un montant déjà au centime. */
  toDb(): string {
    if (!this.amount.equals(this.amount.toDecimalPlaces(2))) {
      throw new RangeError("Montant non arrondi au centime : appeler roundToCents()");
    }
    return this.amount.toFixed(2);
  }

  /** Affichage français : « 1 234,56 € ». */
  format(): string {
    const fixed = this.amount.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
    const [intPart, dec] = fixed.replace("-", "").split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const sign = this.amount.isNegative() && !this.amount.isZero() ? "-" : "";
    return `${sign}${grouped},${dec} €`;
  }

  static sum(values: readonly Money[], currency: Currency = "EUR"): Money {
    return values.reduce((acc, v) => acc.add(v), Money.zero(currency));
  }
}
