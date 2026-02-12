function isSupportedMobilePrefix(prefix: string): boolean {
  return prefix === '9' || prefix === '7';
}

export function normalizeEthiopianPhoneNumberForStorage(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    const mobilePrefix = digits.slice(1, 2);
    if (isSupportedMobilePrefix(mobilePrefix)) {
      return `+251${digits.slice(1)}`;
    }
  }

  if (digits.length === 9) {
    const mobilePrefix = digits.slice(0, 1);
    if (isSupportedMobilePrefix(mobilePrefix)) {
      return `+251${digits}`;
    }
  }

  if (digits.length === 13 && digits.startsWith('2510')) {
    const mobilePrefix = digits.slice(4, 5);
    if (isSupportedMobilePrefix(mobilePrefix)) {
      return `+251${digits.slice(4)}`;
    }
  }

  if (digits.length === 12 && digits.startsWith('251')) {
    const mobilePrefix = digits.slice(3, 4);
    if (isSupportedMobilePrefix(mobilePrefix)) {
      return `+${digits}`;
    }
  }

  if (digits.startsWith('251')) {
    const national = digits.slice(3).replace(/^0+/, '');
    return national ? `+251${national}` : null;
  }

  if (digits.startsWith('0')) {
    const national = digits.slice(1);
    return national ? `+251${national}` : null;
  }

  return `+251${digits}`;
}
