import "server-only";
import { cookies } from "next/headers";
import type { Dataset } from "@/types";
import { getRepository } from "./repository";

export const DATASET_COOKIE = "aal_dataset";

/**
 * The dataset currently being analysed. Real and demo data are never mixed.
 * Defaults to real data when any exists, otherwise demo data if loaded.
 */
export async function getDataset(): Promise<Dataset> {
  const v = (await cookies()).get(DATASET_COOKIE)?.value;
  if (v === "real" || v === "demo") return v;
  const repo = getRepository();
  if ((await repo.countRounds("real")) > 0) return "real";
  return (await repo.countRounds("demo")) > 0 ? "demo" : "real";
}
