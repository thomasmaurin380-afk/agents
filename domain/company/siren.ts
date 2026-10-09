/** SIREN : 9 chiffres et clé de Luhn valide. Espaces tolérés en saisie. */
export function normalizeSiren(input: string): string {
  return input.replace(/[\s.]/g, "");
}

export function isValidSiren(input: string): boolean {
  const siren = normalizeSiren(input);
  if (!/^\d{9}$/.test(siren)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(siren[8 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
