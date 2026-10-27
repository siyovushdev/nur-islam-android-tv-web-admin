import { fail } from "./format-error";

export type XmlAttrs = Record<string, string>;

export type XmlHandler = {
  start: (name: string, attrs: XmlAttrs) => void;
  end: (name: string) => void;
  text: (value: string) => void;
};

export function walkXml(text: string, handler: XmlHandler): void {
  if (text.includes("\u0000") || /<!\s*(DOCTYPE|ENTITY)/i.test(text)) fail("DTD и XML-сущности запрещены");
  let index = 0;
  let depth = 0;
  const length = text.length;
  while (index < length) {
    if (text[index] !== "<") {
      const next = text.indexOf("<", index);
      const raw = text.slice(index, next === -1 ? length : next);
      if (raw) handler.text(decodeXml(raw));
      index = next === -1 ? length : next;
      continue;
    }
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      if (end < 0) fail("повреждённый XML");
      index = end + 3;
      continue;
    }
    if (text.startsWith("<?", index)) {
      const end = text.indexOf("?>", index + 2);
      if (end < 0) fail("повреждённый XML");
      index = end + 2;
      continue;
    }
    if (text.startsWith("<![CDATA[", index)) {
      const end = text.indexOf("]]>", index + 9);
      if (end < 0) fail("повреждённый XML");
      handler.text(text.slice(index + 9, end));
      index = end + 3;
      continue;
    }
    if (text.startsWith("<!", index)) fail("DTD и XML-сущности запрещены");
    const closing = text[index + 1] === "/";
    let cursor = index + (closing ? 2 : 1);
    while (cursor < length && isNameChar(text[cursor])) cursor += 1;
    if (cursor === index + (closing ? 2 : 1)) fail("повреждённый XML");
    const rawName = text.slice(index + (closing ? 2 : 1), cursor);
    const name = localName(rawName);
    const attrs: XmlAttrs = {};
    while (cursor < length && text[cursor] !== ">" && text[cursor] !== "/") {
      if (text[cursor] === " " || text[cursor] === "\n" || text[cursor] === "\r" || text[cursor] === "\t") {
        cursor += 1;
        continue;
      }
      const nameStart = cursor;
      while (cursor < length && isNameChar(text[cursor])) cursor += 1;
      const attrName = localName(text.slice(nameStart, cursor));
      while (cursor < length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
      if (text[cursor] !== "=") fail("повреждённый XML");
      cursor += 1;
      while (cursor < length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
      const quote = text[cursor];
      if (quote !== '"' && quote !== "'") fail("повреждённый XML");
      const valueStart = cursor + 1;
      const valueEnd = text.indexOf(quote, valueStart);
      if (valueEnd < 0) fail("повреждённый XML");
      if (!(attrName in attrs)) attrs[attrName] = decodeXml(text.slice(valueStart, valueEnd));
      cursor = valueEnd + 1;
    }
    const selfClosing = text[cursor] === "/";
    if (selfClosing) cursor += 1;
    if (text[cursor] !== ">") fail("повреждённый XML");
    index = cursor + 1;
    if (closing) {
      handler.end(name);
      depth -= 1;
      if (depth < 0) fail("повреждённый XML");
      continue;
    }
    depth += 1;
    if (depth > 32) fail("слишком глубокий XML");
    handler.start(name, attrs);
    if (selfClosing) {
      handler.end(name);
      depth -= 1;
    }
  }
}

function isNameChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === ":" || char === "_" || char === "." || char === "-";
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_entity: string, body: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[body]) return named[body];
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    fail("DTD и XML-сущности запрещены");
  });
}
