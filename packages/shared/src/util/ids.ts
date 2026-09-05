/** Document-number helpers. Sequences are owned by the API; formatting lives here so
 *  the seed, the API and the UI all render an identical string. */

export function quotationNumber(seq: number): string {
  return `Q-${seq}`;
}
export function orderNumber(seq: number): string {
  return `ORD-${seq}`;
}
export function invoiceNumber(seq: number): string {
  return `INV-${seq}`;
}
export function creditNoteNumber(seq: number): string {
  return `CN-${seq}`;
}
export function subscriptionNumber(seq: number): string {
  return `SUB-${seq}`;
}

/** Extract the numeric part of any of the above, or null. */
export function documentSeq(num: string): number | null {
  const m = /-(\d+)$/.exec(num);
  return m ? Number(m[1]) : null;
}
