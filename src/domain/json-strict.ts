import { fail } from "./format-error";

export type Json = null | boolean | number | string | Json[] | JsonObject;
export type JsonObject = { [key: string]: Json };

export const SCHEDULE_MAX_BYTES = 1_048_576;
export const CALENDAR_MAX_BYTES = 1_048_576;

const rawNumbers = new WeakMap<object, Map<string, string>>();

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    fail("Файл должен быть в UTF-8");
  }
}

type Token =
  | { kind: "punct"; value: "{" | "}" | "[" | "]" | ":" | "," }
  | { kind: "null" | "true" | "false" }
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string; value: number };

export function parseStrictJson(text: string): Json {
  const parser = new Parser(tokenize(text));
  const value = parser.parse(0);
  if (!parser.done()) fail("Данные после JSON");
  return value;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  done(): boolean {
    return this.index >= this.tokens.length;
  }

  private take(): Token {
    const token = this.tokens[this.index];
    if (!token) fail("Повреждённый JSON");
    this.index += 1;
    return token;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  parse(depth: number): Json {
    if (depth > 10) fail("Слишком глубокая структура JSON");
    const token = this.take();
    if (token.kind === "null") return null;
    if (token.kind === "true") return true;
    if (token.kind === "false") return false;
    if (token.kind === "string") return token.value;
    if (token.kind === "number") return token.value;
    if (token.kind === "punct" && token.value === "{") return this.object(depth);
    if (token.kind === "punct" && token.value === "[") return this.array(depth);
    fail("Недопустимое значение JSON");
  }

  private object(depth: number): JsonObject {
    const object = Object.create(null) as JsonObject;
    if (this.peek()?.kind === "punct" && this.peek()?.kind === "punct" && (this.peek() as { value: string }).value === "}") {
      this.take();
      return object;
    }
    for (;;) {
      const keyToken = this.take();
      if (keyToken.kind !== "string") fail("Повреждённый JSON");
      const colon = this.take();
      if (colon.kind !== "punct" || colon.value !== ":") fail("Повреждённый JSON");
      if (Object.hasOwn(object, keyToken.value)) fail(`Повтор JSON-поля ${keyToken.value}`);
      const valueToken = this.tokens[this.index];
      object[keyToken.value] = this.parse(depth + 1);
      if (valueToken?.kind === "number") rememberRaw(object, keyToken.value, valueToken.raw);
      const next = this.peek();
      if (next?.kind === "punct" && next.value === ",") {
        this.take();
        continue;
      }
      if (next?.kind === "punct" && next.value === "}") {
        this.take();
        return object;
      }
      fail("Повреждённый JSON");
    }
  }

  private array(depth: number): Json[] {
    const array: Json[] = [];
    if (this.peek()?.kind === "punct" && (this.peek() as { value: string }).value === "]") {
      this.take();
      return array;
    }
    for (;;) {
      if (array.length >= 2048) fail("Слишком много записей");
      const valueToken = this.tokens[this.index];
      const value = this.parse(depth + 1);
      if (valueToken?.kind === "number") rememberRaw(array, String(array.length), valueToken.raw);
      array.push(value);
      const next = this.peek();
      if (next?.kind === "punct" && next.value === ",") {
        this.take();
        continue;
      }
      if (next?.kind === "punct" && next.value === "]") {
        this.take();
        return array;
      }
      fail("Повреждённый JSON");
    }
  }
}

function rememberRaw(holder: object, key: string, raw: string) {
  let map = rawNumbers.get(holder);
  if (!map) {
    map = new Map();
    rawNumbers.set(holder, map);
  }
  map.set(key, raw);
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      index += 1;
      continue;
    }
    if (char === "{" || char === "}" || char === "[" || char === "]" || char === ":" || char === ",") {
      tokens.push({ kind: "punct", value: char });
      index += 1;
      continue;
    }
    if (char === '"') {
      const parsed = readString(text, index);
      tokens.push({ kind: "string", value: parsed.value });
      index = parsed.index;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      const parsed = readNumber(text, index);
      tokens.push({ kind: "number", raw: parsed.raw, value: parsed.value });
      index = parsed.index;
      continue;
    }
    if (text.startsWith("null", index)) {
      tokens.push({ kind: "null" });
      index += 4;
      continue;
    }
    if (text.startsWith("true", index)) {
      tokens.push({ kind: "true" });
      index += 4;
      continue;
    }
    if (text.startsWith("false", index)) {
      tokens.push({ kind: "false" });
      index += 5;
      continue;
    }
    fail("Повреждённый JSON");
  }
  return tokens;
}

function readString(text: string, start: number): { value: string; index: number } {
  let index = start + 1;
  let value = "";
  while (index < text.length) {
    const char = text[index];
    if (char === '"') return { value, index: index + 1 };
    if (char === "\\") {
      const next = text[index + 1];
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (next && simple[next] !== undefined) {
        value += simple[next];
        index += 2;
        continue;
      }
      if (next === "u") {
        const hex = text.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Повреждённый JSON");
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }
      fail("Повреждённый JSON");
    }
    if (char.charCodeAt(0) <= 0x1f) fail("Повреждённый JSON");
    value += char;
    index += 1;
  }
  fail("Повреждённый JSON");
}

function readNumber(text: string, start: number): { raw: string; value: number; index: number } {
  const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(start));
  if (!match) fail("Повреждённый JSON");
  const raw = match[0];
  const value = Number(raw);
  if (!Number.isFinite(value)) fail("Недопустимое значение JSON");
  return { raw, value, index: start + raw.length };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function objectKeys(value: JsonObject): string[] {
  return Object.keys(value);
}

export function rawNumber(holder: object, key: string): string | undefined {
  return rawNumbers.get(holder)?.get(key);
}

export function requireText(object: JsonObject, key: string, max: number, label = key): string {
  const value = object[key];
  if (typeof value !== "string") fail(`Поле «${label}» должно быть текстом`);
  if (!value.trim() || value.length > max || hasControl(value)) fail(`Поле «${label}» пустое или слишком длинное`);
  return value;
}

export function requireInteger(object: JsonObject, key: string, pattern: RegExp, message: string): number {
  const value = object[key];
  const raw = rawNumber(object, key);
  if (typeof value !== "number" || raw === undefined || !pattern.test(raw)) fail(message);
  return value;
}

export function requireBoolean(object: JsonObject, key: string, message: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") fail(message);
  return value;
}

export function optionalBoolean(object: JsonObject, key: string, message: string): boolean {
  if (object[key] === undefined) return false;
  return requireBoolean(object, key, message);
}

export function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function sameKeySet(object: JsonObject, keys: readonly string[]): boolean {
  const actual = objectKeys(object);
  if (actual.length !== keys.length) return false;
  const expected = new Set(keys);
  return actual.every((key) => expected.has(key));
}

export function unknownKey(object: JsonObject, allowed: readonly string[]): string | null {
  const set = new Set(allowed);
  return objectKeys(object).find((key) => !set.has(key)) ?? null;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}
