const pdfParse = require('pdf-parse');

const timestampRegex = /(\d{4}-\d{2}-\d{2})(\d{2}:\d{2}:\d{2})\s*-06:00/;
const personIdRegex = /^\d+$/;
const metadataRegexes = [/^barra tulanyork$/i, /^normal attendance$/i, /^device$/i];
const weekdayRegex = /^(sun|mon|tue|wed|thu|fri|sat)$/i;

function isMetadataLine(line) {
  const normalized = line.trim().replace(/\s+/g, ' ');
  if (!normalized) return true;
  if (weekdayRegex.test(normalized)) return true;
  return metadataRegexes.some((regex) => regex.test(normalized));
}

function normalizeName(parts) {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseChecadorPdfText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const rows = [];
  let index = 0;
  while (index < lines.length) {
    const maybePersonId = lines[index];
    if (!personIdRegex.test(maybePersonId)) {
      index += 1;
      continue;
    }

    const personId = maybePersonId;
    const nameParts = [];
    let parsedTimestamp = null;
    let cursor = index + 1;

    while (cursor < lines.length) {
      const line = lines[cursor];
      const timestampMatch = line.match(timestampRegex);
      if (timestampMatch) {
        parsedTimestamp = `${timestampMatch[1]}T${timestampMatch[2]}-06:00`;
        break;
      }
      if (personIdRegex.test(line) && !nameParts.length) {
        break;
      }
      if (!isMetadataLine(line)) {
        nameParts.push(line);
      }
      cursor += 1;
    }

    if (parsedTimestamp) {
      rows.push({
        personId,
        nombre: normalizeName(nameParts),
        timestamp: parsedTimestamp,
      });
      index = cursor + 1;
      continue;
    }

    index += 1;
  }

  return rows;
}

async function parseChecadorPdfBuffer(buffer) {
  const parsed = await pdfParse(buffer);
  return parseChecadorPdfText(parsed.text || '');
}

module.exports = { parseChecadorPdfBuffer, parseChecadorPdfText };
