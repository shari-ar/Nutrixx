export interface NonnegativeRational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let first = left;
  let second = right;
  while (second !== 0n) {
    const remainder = first % second;
    first = second;
    second = remainder;
  }
  return first;
}

function normalize(
  numerator: bigint,
  denominator: bigint,
): NonnegativeRational {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError('A nonnegative rational value is required.');
  }
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

export function rationalFromCanonicalDecimal(
  value: string,
): NonnegativeRational {
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value)) {
    throw new TypeError('A nonnegative canonical decimal is required.');
  }
  const [whole = '0', fraction = ''] = value.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  return normalize(BigInt(`${whole}${fraction}`), denominator);
}

export function addRational(
  left: NonnegativeRational,
  right: NonnegativeRational,
): NonnegativeRational {
  return normalize(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiplyRational(
  left: NonnegativeRational,
  right: NonnegativeRational,
): NonnegativeRational {
  return normalize(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

export function divideRational(
  dividend: NonnegativeRational,
  divisor: NonnegativeRational,
): NonnegativeRational {
  if (divisor.numerator === 0n) {
    throw new RangeError('Division by zero is unavailable.');
  }
  return normalize(
    dividend.numerator * divisor.denominator,
    dividend.denominator * divisor.numerator,
  );
}

export function roundRationalHalfEven(
  value: NonnegativeRational,
  decimalPlaces: number,
): string {
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError('A nonnegative safe decimal-place count is required.');
  }
  const scale = 10n ** BigInt(decimalPlaces);
  const scaledNumerator = value.numerator * scale;
  let rounded = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  const comparison = remainder * 2n - value.denominator;
  if (comparison > 0n || (comparison === 0n && rounded % 2n === 1n)) {
    rounded += 1n;
  }
  if (rounded === 0n) return '0';
  if (decimalPlaces === 0) return rounded.toString();

  const digits = rounded.toString().padStart(decimalPlaces + 1, '0');
  const splitAt = digits.length - decimalPlaces;
  const fraction = digits.slice(splitAt).replace(/0+$/u, '');
  return fraction.length === 0
    ? digits.slice(0, splitAt)
    : `${digits.slice(0, splitAt)}.${fraction}`;
}

export const ZERO_RATIONAL: NonnegativeRational = {
  numerator: 0n,
  denominator: 1n,
};

export const ONE_HUNDRED_RATIONAL: NonnegativeRational = {
  numerator: 100n,
  denominator: 1n,
};

export function per100GramAmountV1(
  amountPerServing: string,
  servingGramWeight: string,
): string {
  return roundRationalHalfEven(
    divideRational(
      multiplyRational(
        rationalFromCanonicalDecimal(amountPerServing),
        ONE_HUNDRED_RATIONAL,
      ),
      rationalFromCanonicalDecimal(servingGramWeight),
    ),
    12,
  );
}
