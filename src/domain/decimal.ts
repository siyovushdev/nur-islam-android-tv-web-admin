/** Exact decimal for Excel fractions. Binary floating point is not used. */
export class Decimal {
  constructor(readonly digits: bigint, readonly scale: number) {}

  static parse(text: string): Decimal | null {
    const match = /^([+-]?)([0-9]{1,12})(?:\.([0-9]{1,30}))?(?:[eE]([+-]?[0-9]{1,2}))?$/.exec(text);
    if (!match) return null;
    const sign = match[1] === "-" ? -1n : 1n;
    const frac = match[3] ?? "";
    const exp = match[4] ? Number(match[4]) : 0;
    const digits = sign * BigInt((match[2] + frac).replace(/^(-)?0+(?=\d)/, "$1") || "0");
    return Decimal.fromShift(digits, frac.length - exp);
  }

  static fromShift(digits: bigint, scale: number): Decimal {
    if (scale >= 0) return new Decimal(digits, scale);
    return new Decimal(digits * 10n ** BigInt(-scale), 0);
  }

  mulInt(value: number): Decimal {
    return new Decimal(this.digits * BigInt(value), this.scale);
  }

  sub(other: Decimal): Decimal {
    const [left, right] = align(this, other);
    return new Decimal(left - right, Math.max(this.scale, other.scale));
  }

  compare(other: Decimal): number {
    const [left, right] = align(this, other);
    if (left === right) return 0;
    return left > right ? 1 : -1;
  }

  abs(): Decimal {
    return new Decimal(this.digits < 0n ? -this.digits : this.digits, this.scale);
  }

  roundHalfUp(): Decimal {
    if (this.scale <= 0) return new Decimal(this.digits * 10n ** BigInt(-this.scale), 0);
    const div = 10n ** BigInt(this.scale);
    const sign = this.digits < 0n ? -1n : 1n;
    const absDigits = this.digits < 0n ? -this.digits : this.digits;
    const quotient = absDigits / div;
    const remainder = absDigits % div;
    const rounded = remainder * 2n >= div ? quotient + 1n : quotient;
    return new Decimal(sign * rounded, 0);
  }

  isExactInteger(): boolean {
    if (this.scale <= 0) return true;
    const div = 10n ** BigInt(this.scale);
    return this.digits % div === 0n;
  }

  toInt(): number {
    const rounded = this.scale === 0 ? this : Decimal.fromShift(this.digits, this.scale);
    if (rounded.scale !== 0) {
      const div = 10n ** BigInt(rounded.scale);
      return Number(rounded.digits / div);
    }
    return Number(rounded.digits);
  }
}

function align(left: Decimal, right: Decimal): [bigint, bigint] {
  if (left.scale === right.scale) return [left.digits, right.digits];
  if (left.scale > right.scale) return [left.digits, right.digits * 10n ** BigInt(left.scale - right.scale)];
  return [left.digits * 10n ** BigInt(right.scale - left.scale), right.digits];
}

export function excelMinutes(text: string): { minutes: number } | { error: string } {
  const fraction = Decimal.parse(text);
  const zero = Decimal.parse("0");
  const one = Decimal.parse("1");
  if (!fraction || !zero || !one) return { error: "неверное число" };
  if (fraction.compare(zero) < 0 || fraction.compare(one) >= 0) return { error: "время вне суток" };
  const minutes = fraction.mulInt(1440);
  const integer = minutes.roundHalfUp();
  const gap = minutes.sub(integer).abs();
  const threshold = Decimal.parse("0.000001");
  if (!threshold || gap.compare(threshold) > 0) return { error: "время содержит секунды; нужны точные минуты" };
  const value = integer.toInt();
  if (value < 0 || value > 1439) return { error: "время вне суток" };
  return { minutes: value };
}
