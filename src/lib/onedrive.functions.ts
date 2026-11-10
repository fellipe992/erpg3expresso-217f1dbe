import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

export const sincronizarPastasMotoristas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaffOneDrive } = await import("@/lib/onedrive-acl.server");
    const { ensureMotoristaFolder } = await import("@/lib/onedrive.server");
    const ctx = context as Ctx;
    await assertStaffOneDrive(ctx);
    const { data, error } = await ctx.supabase.from("motoristas").select("nome").eq("ativo", true);
    if (error) throw new Error(error.message);
    let criadas = 0;
    for (const m of (data ?? []) as { nome: string }[]) {
      const r = await ensureMotoristaFolder(m.nome);
      if (r.criada) criadas += 1;
    }
    return { total: (data ?? []).length, criadas };
  });

export const listarDocsMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { motoristaId?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { resolverPastaMotorista } = await import("@/lib/onedrive-acl.server");
    const { listFolder } = await import("@/lib/onedrive.server");
    const pasta = await resolverPastaMotorista(context as Ctx, data.motoristaId);
    const arquivos = (await listFolder(pasta)).filter((f) => !f.isFolder);
    return { pasta, arquivos };
  });

export const uploadDocMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { motoristaId?: string; nome: string; mime?: string; base64: string }) => {
    if (!data?.nome || !data?.base64) throw new Error("Arquivo inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { resolverPastaMotorista } = await import("@/lib/onedrive-acl.server");
    const { uploadFile } = await import("@/lib/onedrive.server");
    const pasta = await resolverPastaMotorista(context as Ctx, data.motoristaId);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("Arquivo acima de 4 MB");
    const nome = await uploadFile(pasta, data.nome, bytes, data.mime ?? "application/octet-stream");
    return { nome };
  });

const MAX_DOWNLOAD = 25 * 1024 * 1024;

export const baixarDocMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { motoristaId?: string; itemId: string }) => {
    if (!data?.itemId || typeof data.itemId !== "string") throw new Error("Arquivo inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { resolverPastaMotorista } = await import("@/lib/onedrive-acl.server");
    const { downloadFileInFolder } = await import("@/lib/onedrive.server");
    const pasta = await resolverPastaMotorista(context as Ctx, data.motoristaId);
    const f = await downloadFileInFolder(pasta, data.itemId, MAX_DOWNLOAD);
    let bin = "";
    for (let i = 0; i < f.bytes.length; i += 8192) bin += String.fromCharCode(...f.bytes.subarray(i, i + 8192));
    return { nome: f.nome, mime: f.mime, base64: btoa(bin) };
  });

/** Somente equipe interna: link da pasta geral (sem motoristaId) ou da pasta do motorista. */
export const linkPastaOneDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { motoristaId?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { assertStaffOneDrive, resolverPastaMotorista } = await import("@/lib/onedrive-acl.server");
    const { folderLinks, ensureFolder, ROOT_FOLDER } = await import("@/lib/onedrive.server");
    const ctx = context as Ctx;
    await assertStaffOneDrive(ctx);
    let pasta = ROOT_FOLDER;
    if (data.motoristaId) pasta = await resolverPastaMotorista(ctx, data.motoristaId);
    else await ensureFolder("", ROOT_FOLDER);
    return { pasta, ...(await folderLinks(pasta)) };
  });
