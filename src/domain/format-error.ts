export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

export function fail(message: string): never {
  throw new FormatError(message);
}
