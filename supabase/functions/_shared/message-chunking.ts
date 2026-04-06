export interface MessageChunkingOptions {
  enableGeneralBreaking?: boolean;
}

const PIX_KEY_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  /\+?55\d{10,13}\b/,
];

function extractPixKey(text: string): string | null {
  for (const pattern of PIX_KEY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function isPixLabelOnly(line: string): boolean {
  const normalized = line
    .trim()
    .toLowerCase()
    .replace(/[!:.–-]+$/g, "")
    .trim();

  return normalized === "nossa chave pix" || normalized === "chave pix";
}

function hasPixSignal(text: string): boolean {
  return /chave\s+pix/i.test(text) || extractPixKey(text) !== null;
}

function normalizePixSeparators(content: string): string {
  let normalized = content.replace(/\r\n?/g, "\n").trim();

  normalized = normalized.replace(
    /((?:nossa\s+)?chave\s+pix)\s*[:\-–]?\s*(?=\S)/gi,
    "$1\n\n",
  );

  normalized = normalized.replace(
    /([^\n])\n(?=((?:nossa\s+)?chave\s+pix))/gi,
    "$1\n\n",
  );

  for (const pattern of PIX_KEY_PATTERNS) {
    normalized = normalized.replace(pattern, (match, offset, source) => {
      const before = source.slice(Math.max(0, offset - 2), offset);
      const after = source.slice(offset + match.length, offset + match.length + 64);

      const needsBreakBefore = before && !before.endsWith("\n\n") && !before.endsWith("\n");
      const needsBreakAfter = after && !after.startsWith("\n\n") && !after.startsWith("\n");

      return `${needsBreakBefore ? "\n\n" : ""}${match}${needsBreakAfter ? "\n\n" : ""}`;
    });
  }

  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  return normalized.trim();
}

function splitPixSensitiveChunk(chunk: string): string[] {
  const trimmed = chunk.trim();
  if (!trimmed) return [];
  if (!hasPixSignal(trimmed)) return [trimmed];

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const segments: string[] = [];
  let buffer: string[] = [];
  let sawPixSegment = false;

  const flushBuffer = () => {
    if (buffer.length > 0) {
      segments.push(buffer.join("\n"));
      buffer = [];
    }
  };

  for (const line of lines) {
    const pixKey = extractPixKey(line);
    const labelWithKeyMatch = line.match(/^(.*?(?:nossa\s+)?chave\s+pix)\s*[:\-–]?\s*(.*)$/i);

    if (labelWithKeyMatch && pixKey) {
      flushBuffer();

      const label = labelWithKeyMatch[1].trim().replace(/[:\-–]\s*$/, "");
      const rest = labelWithKeyMatch[2] || "";
      const beforeKey = rest.slice(0, rest.indexOf(pixKey)).replace(/[:\-–\s]+$/g, "").trim();
      const afterKey = rest.slice(rest.indexOf(pixKey) + pixKey.length).replace(/^[:\-–\s]+/g, "").trim();

      if (label) segments.push(label);
      if (beforeKey) segments.push(beforeKey);
      segments.push(pixKey);
      if (afterKey) segments.push(afterKey);

      sawPixSegment = true;
      continue;
    }

    if (isPixLabelOnly(line)) {
      flushBuffer();
      segments.push(line.replace(/[:\-–]\s*$/, "").trim());
      sawPixSegment = true;
      continue;
    }

    if (pixKey) {
      flushBuffer();

      const keyIndex = line.indexOf(pixKey);
      const beforeKey = line.slice(0, keyIndex).replace(/[:\-–\s]+$/g, "").trim();
      const afterKey = line.slice(keyIndex + pixKey.length).replace(/^[:\-–\s]+/g, "").trim();

      if (beforeKey) segments.push(beforeKey);
      segments.push(pixKey);
      if (afterKey) segments.push(afterKey);

      sawPixSegment = true;
      continue;
    }

    if (sawPixSegment && /(comprovante|pagamento)/i.test(line)) {
      flushBuffer();
      segments.push(line);
      continue;
    }

    buffer.push(line);
  }

  flushBuffer();

  return segments.length > 0 ? segments : [trimmed];
}

export function splitMessageIntoChunks(
  content: string,
  options: MessageChunkingOptions = {},
): string[] {
  const normalized = normalizePixSeparators(content);
  const baseChunks = options.enableGeneralBreaking === false
    ? [normalized]
    : normalized.split(/\n\n+/);

  return baseChunks
    .flatMap(splitPixSensitiveChunk)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}
