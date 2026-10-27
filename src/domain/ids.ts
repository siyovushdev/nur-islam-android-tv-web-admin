const LETTERS: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function isPublicId(value: string): boolean {
  return ID_RE.test(value);
}

export function slugId(text: string, fallback: string): string {
  let built = "";
  for (const char of text.trim().toLowerCase()) {
    if (LETTERS[char] !== undefined) built += LETTERS[char];
    else if (/[a-z0-9]/.test(char)) built += char;
    else built += "-";
  }
  built = built.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z0-9]/.test(built)) built = fallback;
  built = built.slice(0, 80).replace(/-+$/g, "");
  return isPublicId(built) ? built : fallback;
}

const TEST_SOURCE = /(?:^|[^\p{L}\p{N}])(?:test[\p{L}\p{N}]*|synthetic[\p{L}\p{N}]*|demo[\p{L}\p{N}]*|тест[\p{L}\p{N}]*|демо[\p{L}\p{N}]*|макет[\p{L}\p{N}]*)(?=$|[^\p{L}\p{N}])/iu;

export function isTestSource(source: string): boolean {
  return TEST_SOURCE.test(source);
}
