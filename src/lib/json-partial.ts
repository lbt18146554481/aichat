/** Incremental decode of a JSON string field while the model is still streaming. */
export function extractPartialJsonStringField(buffer: string, field: string): string | null {
  const re = new RegExp(`"${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`);
  const m = buffer.match(re);
  if (!m || m.index === undefined) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === "\\") {
      if (i + 1 >= buffer.length) break;
      const n = buffer[i + 1];
      if (n === "u") {
        if (i + 5 >= buffer.length) break;
        const hex = buffer.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const map: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        '"': '"',
        "\\": "\\",
        "/": "/",
      };
      out += map[n] ?? n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}
