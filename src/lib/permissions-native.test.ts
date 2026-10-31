import { describe, expect, it } from "vitest";
import { classificarErroMicrofone, classificarErroMicrofoneNome } from "./permissions-native";

describe("classificarErroMicrofoneNome", () => {
  it("no app, permissão negada manda abrir os ajustes do app", () => {
    const r = classificarErroMicrofoneNome("NotAllowedError", true);
    expect(r.abrirAjustes).toBe(true);
    expect(r.texto).toContain("Ajustes");
  });

  it("no navegador, permissão negada não oferece abrir ajustes do app", () => {
    const r = classificarErroMicrofoneNome("NotAllowedError", false);
    expect(r.abrirAjustes).toBe(false);
    expect(r.texto).toContain("navegador");
  });

  it("sem microfone aponta o aparelho, não a permissão", () => {
    const r = classificarErroMicrofoneNome("NotFoundError", true);
    expect(r.abrirAjustes).toBe(false);
    expect(r.texto).toBe("Nenhum microfone encontrado neste aparelho.");
  });

  it("microfone ocupado por outro app tem mensagem própria", () => {
    const r = classificarErroMicrofoneNome("NotReadableError", true);
    expect(r.texto).toContain("outro app");
    expect(r.abrirAjustes).toBe(false);
  });

  it("motivo desconhecido cai na mensagem genérica", () => {
    const r = classificarErroMicrofoneNome("BoomError", true);
    expect(r.texto).toBe("Não consegui ligar o microfone. Tente de novo.");
    expect(r.abrirAjustes).toBe(false);
  });

  it("lê o nome do erro de um objeto DOMException-like", () => {
    const r = classificarErroMicrofone({ name: "SecurityError" }, true);
    expect(r.abrirAjustes).toBe(true);
  });
});
