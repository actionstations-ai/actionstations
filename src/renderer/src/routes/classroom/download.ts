function save(url: string, fileName: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** Save text as a file through the browser's download path; nothing leaves the computer. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  save(URL.createObjectURL(new Blob([text], { type })), fileName)
}

/** Save a PDF that main returned as base64. */
export function downloadPdf(file: { fileName: string; base64: string }): void {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
  save(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), file.fileName)
}
