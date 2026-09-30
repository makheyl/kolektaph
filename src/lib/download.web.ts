/** Downloads a text file in the browser (e.g. a CSV export). */
export async function saveTextFile(filename: string, text: string): Promise<void> {
  // The BOM lets spreadsheet apps read accents (ñ) correctly.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
