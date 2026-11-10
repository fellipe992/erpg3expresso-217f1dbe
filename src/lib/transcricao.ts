/** Remove marcações que os modelos devolvem para silêncio/ruído (ex.: "<noise>", "[silêncio]"). */
export function limparTranscricao(t: string): string {
  return t
    .replace(/<[^>]{1,20}>/g, " ")
    .replace(/\[(?:sil[eê]ncio|ru[ií]do|noise|silence|m[uú]sica|music|inaud[ií]vel)[^\]]{0,20}\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
