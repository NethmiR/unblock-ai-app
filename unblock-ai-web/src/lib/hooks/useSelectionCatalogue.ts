"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { selectionCataloguePath } from "@/lib/api/selection";
import type { SelectionCatalogueDto } from "@/types/selection";

export function useSelectionCatalogue(): SWRResponse<SelectionCatalogueDto, unknown> {
  return useSWR<SelectionCatalogueDto>(selectionCataloguePath(), fetcher, { revalidateOnFocus: false });
}
