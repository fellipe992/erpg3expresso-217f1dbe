/**
 * Integração com o OneDrive (via connector gateway da Lovable).
 * Estrutura: /G3 Expresso - Agregados/<Nome do motorista>/...
 */
const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_onedrive/v1.0";

export const ROOT_FOLDER = "G3 Expresso - Agregados";

function headers() {
  const lov = process.env["LOVABLE_API_KEY"];
  const key = process.env["MICROSOFT_ONEDRIVE_API_KEY"];
  if (!lov || !key) throw new Error("OneDrive não conectado (credenciais ausentes).");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key };
}

/** Remove caracteres proibidos pelo OneDrive em nomes de pasta/arquivo. */
export function sanitizeName(raw: string) {
  const s = (raw ?? "")
    .replace(/[\\/:*?"<>|#%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!s) throw new Error("Nome inválido");
  return s;
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function graph(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OneDrive [${res.status}]: ${body.slice(0, 400)}`);
  }
  return res;
}

async function getItem(path: string) {
  const res = await fetch(`${GATEWAY}/me/drive/root:/${enc(path)}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OneDrive [${res.status}]: ${(await res.text()).slice(0, 400)}`);
  return (await res.json()) as { id: string; name: string };
}

/** Cria a pasta se não existir. Retorna true se criou agora. */
export async function ensureFolder(parentPath: string, name: string): Promise<boolean> {
  const full = parentPath ? `${parentPath}/${name}` : name;
  if (await getItem(full)) return false;
  const parent = parentPath ? `/me/drive/root:/${enc(parentPath)}:/children` : "/me/drive/root/children";
  await graph(parent, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
  });
  return true;
}

export async function ensureMotoristaFolder(nome: string) {
  const safe = sanitizeName(nome);
  await ensureFolder("", ROOT_FOLDER);
  const criada = await ensureFolder(ROOT_FOLDER, safe);
  return { pasta: `${ROOT_FOLDER}/${safe}`, criada };
}

export type OneDriveFile = {
  id: string;
  name: string;
  size: number;
  updated: string | null;
  url: string | null;
  isFolder: boolean;
};

export async function listFolder(path: string): Promise<OneDriveFile[]> {
  const res = await fetch(
    `${GATEWAY}/me/drive/root:/${enc(path)}:/children?$top=200&$select=id,name,size,lastModifiedDateTime,folder,@microsoft.graph.downloadUrl`,
    { headers: headers() },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OneDrive [${res.status}]: ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { value: Record<string, unknown>[] };
  return (json.value ?? []).map((it) => ({
    id: String(it["id"]),
    name: String(it["name"]),
    size: Number(it["size"] ?? 0),
    updated: (it["lastModifiedDateTime"] as string) ?? null,
    url: (it["@microsoft.graph.downloadUrl"] as string) ?? null,
    isFolder: !!it["folder"],
  }));
}

export async function uploadFile(path: string, fileName: string, bytes: Uint8Array, mime: string) {
  const safe = sanitizeName(fileName);
  await graph(`/me/drive/root:/${enc(path)}/${encodeURIComponent(safe)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": mime || "application/octet-stream" },
    body: bytes as unknown as BodyInit,
  });
  return safe;
}
