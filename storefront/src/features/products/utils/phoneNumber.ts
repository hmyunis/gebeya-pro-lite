function isSupportedInputMobilePrefix(prefix: string): boolean {
  return prefix === "9";
}

function isSupportedDisplayMobilePrefix(prefix: string): boolean {
  return prefix === "9" || prefix === "7";
}

function stripPhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidEthiopianPhoneInput(value?: string | null): boolean {
  if (!value) return false;

  let digits = stripPhoneDigits(value);
  if (!digits) return false;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    const mobilePrefix = digits.slice(1, 2);
    return isSupportedInputMobilePrefix(mobilePrefix);
  }

  if (digits.length === 13 && digits.startsWith("2510")) {
    const mobilePrefix = digits.slice(4, 5);
    return isSupportedInputMobilePrefix(mobilePrefix);
  }

  if (digits.length === 12 && digits.startsWith("251")) {
    const mobilePrefix = digits.slice(3, 4);
    return isSupportedInputMobilePrefix(mobilePrefix);
  }

  return false;
}

export function formatEthiopianPhoneForDisplay(
  phoneNumber?: string | null,
): string {
  if (!phoneNumber) {
    return "-";
  }

  const digits = stripPhoneDigits(phoneNumber);
  if (!digits) {
    return phoneNumber;
  }

  if (digits.length === 12 && digits.startsWith("251")) {
    const mobilePrefix = digits.slice(3, 4);
    if (isSupportedDisplayMobilePrefix(mobilePrefix)) {
      return `0${digits.slice(3)}`;
    }
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    const mobilePrefix = digits.slice(1, 2);
    if (isSupportedDisplayMobilePrefix(mobilePrefix)) {
      return digits;
    }
  }

  if (digits.length === 9) {
    const mobilePrefix = digits.slice(0, 1);
    if (isSupportedDisplayMobilePrefix(mobilePrefix)) {
      return `0${digits}`;
    }
  }

  return phoneNumber;
}
