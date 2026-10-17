// La build ESM di tesseract.js non ha tipi propri: i pochi che servono sono in ocrPdf.ts.
declare module 'tesseract.js/dist/tesseract.esm.min.js' {
  const tesseract: unknown
  export default tesseract
}
