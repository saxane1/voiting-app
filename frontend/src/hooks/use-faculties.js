"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/utils/axios";
import { queryKeys } from "@/utils/query-keys";

/**
 * GET /faculties — AUTH, not ADMIN, so this same hook serves any signed-in
 * screen that needs the list (F4 will manage them; F3 only reads).
 *
 * Response: { faculties: [{ id, name, code, createdAt, updatedAt, studentCount }] }
 * where studentCount counts ACTIVE students only.
 *
 * Faculties change perhaps once a year, so this is cached hard: the student
 * list re-renders constantly as pages and filters change, and none of that
 * should re-request seven rows.
 */

async function fetchFaculties() {
  const { data } = await api.get("/faculties");

  return data.faculties ?? [];
}

export function useFaculties() {
  return useQuery({
    queryKey: queryKeys.faculties,
    queryFn: fetchFaculties,
    staleTime: 10 * 60_000,
  });
}

/** "ENG" if there is a code, else the full name — for the table's tight column. */
export function facultyShortLabel(faculty) {
  return faculty?.code || faculty?.name || "—";
}
