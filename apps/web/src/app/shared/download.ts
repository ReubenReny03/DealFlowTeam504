/**
 * Saves a blob response (CSV/PDF export) to the user's machine.
 * The API sends these as raw file responses, not the `{success,data,error}`
 * envelope `ApiService` unwraps, so exports go through `HttpClient` directly
 * with `responseType: 'blob'` and land here to trigger the actual save.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
