/// <reference types="google.maps" />
// Busca de empresas do Hunter executada no navegador.
// A chave do Google usada pelo projeto é restrita por referer, então as chamadas
// REST feitas pelo servidor são bloqueadas. Aqui usamos a Maps JS API, que é
// autorizada para o domínio do app.
import { loadGoogleMaps } from "@/lib/google-maps-loader";

export type EmpresaBruta = {
  place_id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
};

async function geocodificar(cidade: string): Promise<google.maps.LatLng | null> {
  const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
  try {
    const { results } = await new Geocoder().geocode({
      address: cidade,
      region: "br",
      language: "pt-BR",
    });
    return results[0]?.geometry?.location ?? null;
  } catch {
    return null;
  }
}

/** Places API (New) via Maps JS. */
async function buscarPlacesNovo(
  textQuery: string,
  centro: google.maps.LatLng | null,
  raioMetros: number,
): Promise<EmpresaBruta[]> {
  const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
  const { places } = await Place.searchByText({
    textQuery,
    fields: ["id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteURI", "location"],
    language: "pt-BR",
    region: "BR",
    maxResultCount: 20,
    ...(centro
      ? { locationBias: { center: centro, radius: Math.min(raioMetros, 50000) } }
      : {}),
  });

  return places.map((p) => ({
    place_id: p.id,
    nome: p.displayName ?? "Empresa sem nome",
    endereco: p.formattedAddress ?? null,
    telefone: p.nationalPhoneNumber ?? null,
    website: p.websiteURI ?? null,
    latitude: p.location?.lat() ?? null,
    longitude: p.location?.lng() ?? null,
  }));
}

/** Fallback: Places legado (PlacesService.textSearch + getDetails). */
async function buscarPlacesLegado(
  textQuery: string,
  centro: google.maps.LatLng | null,
  raioMetros: number,
): Promise<EmpresaBruta[]> {
  const service = new google.maps.places.PlacesService(document.createElement("div"));

  const resultados = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
    service.textSearch(
      {
        query: textQuery,
        ...(centro ? { location: centro, radius: Math.min(raioMetros, 50000) } : {}),
      },
      (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
        else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) resolve([]);
        else reject(new Error(`Google Places retornou: ${status}`));
      },
    );
  });

  const detalhar = (placeId: string) =>
    new Promise<google.maps.places.PlaceResult | null>((resolve) => {
      service.getDetails(
        {
          placeId,
          fields: ["place_id", "name", "formatted_address", "formatted_phone_number", "website", "geometry"],
        },
        (res, status) =>
          resolve(status === google.maps.places.PlacesServiceStatus.OK && res ? res : null),
      );
    });

  const detalhados = await Promise.all(
    resultados.slice(0, 20).map(async (r) => (r.place_id ? (await detalhar(r.place_id)) ?? r : r)),
  );

  return detalhados
    .filter((p) => p.place_id && p.name)
    .map((p) => ({
      place_id: p.place_id as string,
      nome: p.name as string,
      endereco: p.formatted_address ?? null,
      telefone: p.formatted_phone_number ?? null,
      website: p.website ?? null,
      latitude: p.geometry?.location?.lat() ?? null,
      longitude: p.geometry?.location?.lng() ?? null,
    }));
}

export async function buscarEmpresasNoNavegador(input: {
  cidade: string;
  keyword: string;
  raioKm: number;
}): Promise<EmpresaBruta[]> {
  await loadGoogleMaps();
  const centro = await geocodificar(input.cidade);
  const raio = Math.min(Math.max(input.raioKm || 25, 1), 50) * 1000;
  const textQuery = `${input.keyword} em ${input.cidade}`;

  try {
    return await buscarPlacesNovo(textQuery, centro, raio);
  } catch (erroNovo) {
    try {
      return await buscarPlacesLegado(textQuery, centro, raio);
    } catch {
      throw erroNovo instanceof Error
        ? erroNovo
        : new Error("Não foi possível buscar empresas no Google agora.");
    }
  }
}
