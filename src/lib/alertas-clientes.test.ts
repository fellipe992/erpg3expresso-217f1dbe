import { describe, expect, it } from "vitest";
import { destinoRecebeAlerta } from "./alertas-clientes";

describe("direcionamento de alertas por cliente", () => {
  it("envia ao destinatário do cliente da viagem", () => {
    expect(destinoRecebeAlerta({ cliente_id: "cliente-a" }, { cliente_id: "cliente-a", viagem_id: "viagem-a" })).toBe(true);
  });
  it("bloqueia uma viagem de outro cliente mesmo com o mesmo motorista", () => {
    expect(destinoRecebeAlerta({ cliente_id: "cliente-a" }, { cliente_id: "cliente-b", viagem_id: "viagem-b" })).toBe(false);
  });
  it("bloqueia alertas sem cliente identificado", () => {
    expect(destinoRecebeAlerta({ cliente_id: "cliente-a" }, { cliente_id: null, viagem_id: "viagem-a" })).toBe(false);
  });
  it("bloqueia alertas sem viagem comprovada", () => {
    expect(destinoRecebeAlerta({ cliente_id: "cliente-a" }, { cliente_id: "cliente-a", viagem_id: null })).toBe(false);
  });
  it("preserva a torre interna sem restrição de cliente", () => {
    expect(destinoRecebeAlerta({ cliente_id: null }, { cliente_id: "cliente-b", viagem_id: "viagem-b" })).toBe(true);
    expect(destinoRecebeAlerta({ cliente_id: null }, { cliente_id: null, viagem_id: null })).toBe(true);
  });
});