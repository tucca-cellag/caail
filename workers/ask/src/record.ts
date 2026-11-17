/**
 * The question record: one Analytics Engine data point per answered question,
 * kept so answers can be reviewed.
 *
 * It holds the question, the answer, the ids of the entries the answer cited,
 * the model id and the time, and nothing else: no address, no header, no
 * identifier of any kind. `questionRecord` takes only those five values, so
 * nothing about the request can reach the record by accident; record.test.ts
 * checks it with a request full of identifying headers.
 *
 * Analytics Engine refuses a data point whose blobs total more than 16 KB, and a
 * refused write loses the record silently, so every field is cut to a byte
 * budget and the budgets sum to under that limit. 16 KB is read as 16,000 bytes,
 * the stricter of its two readings.
 */

export const BLOB_LIMIT_BYTES = 16_000;

/** Per-field byte budgets. The answer takes what the others leave. */
export const QUESTION_BYTES = 4_096;
export const CITED_BYTES = 1_024;
export const MODEL_BYTES = 256;
export const ANSWER_BYTES = BLOB_LIMIT_BYTES - QUESTION_BYTES - CITED_BYTES - MODEL_BYTES;

/** The record's one index, the dataset's sampling key. Constant, so no record is sampled apart from another. */
const RECORD_INDEX = 'ask';

export interface QuestionRecordInput {
  question: string;
  answer: string;
  citedIds: string[];
  modelId: string;
  /** Milliseconds since the epoch. */
  time: number;
}

export interface RecordPoint {
  indexes: string[];
  blobs: string[];
  doubles: number[];
}

const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

/** The longest prefix of `text` within `max` UTF-8 bytes, never splitting a character. */
export function clipBytes(text: string, max: number): string {
  if (byteLength(text) <= max) return text;
  let used = 0;
  let out = '';
  for (const char of text) {
    const size = byteLength(char);
    if (used + size > max) break;
    used += size;
    out += char;
  }
  return out;
}

/** Whole ids, space-separated, as many as fit: a cut id would name a different entry or none. */
function joinIds(ids: string[], max: number): string {
  let out = '';
  for (const id of ids) {
    const next = out ? `${out} ${id}` : id;
    if (byteLength(next) > max) break;
    out = next;
  }
  return out;
}

export function questionRecord({ question, answer, citedIds, modelId, time }: QuestionRecordInput): RecordPoint {
  return {
    indexes: [RECORD_INDEX],
    blobs: [
      clipBytes(question, QUESTION_BYTES),
      clipBytes(answer, ANSWER_BYTES),
      joinIds(citedIds, CITED_BYTES),
      clipBytes(modelId, MODEL_BYTES),
    ],
    doubles: [time],
  };
}
