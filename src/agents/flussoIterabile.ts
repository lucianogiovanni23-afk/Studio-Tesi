/**
 * Safari (e quindi ogni browser su iPad) non sa ancora scorrere un
 * ReadableStream con `for await`. pdf.js lo fa per leggere il testo delle
 * pagine, e senza questo aiuto ogni PDF dà "undefined is not a function".
 * Si aggiunge il pezzo mancante solo dove manca.
 */
const proto = typeof ReadableStream === 'undefined' ? null : (ReadableStream.prototype as unknown as Record<PropertyKey, unknown>)

if (proto && typeof proto[Symbol.asyncIterator] !== 'function') {
  const valori = function (this: ReadableStream, opzioni?: { preventCancel?: boolean }) {
    const lettore = this.getReader()
    const lasciaStare = opzioni?.preventCancel === true
    return {
      next: () => lettore.read(),
      async return(valore?: unknown) {
        if (!lasciaStare) await lettore.cancel(valore)
        lettore.releaseLock()
        return { done: true, value: valore }
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }
  if (typeof proto.values !== 'function') proto.values = valori
  proto[Symbol.asyncIterator] = valori
}

export {}
