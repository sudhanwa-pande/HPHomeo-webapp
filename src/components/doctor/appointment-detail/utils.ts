import { format, parseISO } from "date-fns";
import type { Prescription, PrescriptionPayload, RxItem } from "@/types/doctor";

export const EMPTY_RX_ITEM: RxItem = {
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
};

export function blankToUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createEmptyPayload(): PrescriptionPayload {
  return {
    chief_complaints: "",
    diagnosis: "",
    advice: "",
    items: [],
  };
}

export function normalizeItem(item?: RxItem | null): RxItem {
  return {
    _clientId: item?._clientId ?? crypto.randomUUID(),
    name: item?.name ?? "",
    dosage: item?.dosage ?? "",
    frequency: item?.frequency ?? "",
    duration: item?.duration ?? "",
    instructions: item?.instructions ?? "",
  };
}

export function normalizePayload(
  payload?: Partial<PrescriptionPayload> | null,
): PrescriptionPayload {
  const items = payload?.items?.length
    ? payload.items.map(normalizeItem)
    : [];
  return {
    chief_complaints: payload?.chief_complaints ?? "",
    diagnosis: payload?.diagnosis ?? "",
    advice: payload?.advice ?? "",
    items,
  };
}

export function prescriptionToPayload(
  prescription?: Prescription | null,
): PrescriptionPayload {
  if (!prescription) return createEmptyPayload();
  return normalizePayload({
    chief_complaints: prescription.chief_complaints,
    diagnosis: prescription.diagnosis,
    advice: prescription.advice,
    items: prescription.items,
  });
}

export function toComparablePayload(payload: PrescriptionPayload) {
  return {
    chief_complaints: payload.chief_complaints?.trim() ?? "",
    diagnosis: payload.diagnosis?.trim() ?? "",
    advice: payload.advice?.trim() ?? "",
    items: payload.items
      .map((item) => ({
        name: item.name?.trim() ?? "",
        dosage: item.dosage?.trim() ?? "",
        frequency: item.frequency?.trim() ?? "",
        duration: item.duration?.trim() ?? "",
        instructions: item.instructions?.trim() ?? "",
      }))
      .filter((item) => Object.values(item).some(Boolean)),
  };
}

export function preparePayloadForApi(
  payload: PrescriptionPayload,
): PrescriptionPayload {
  return {
    chief_complaints: blankToUndefined(payload.chief_complaints),
    diagnosis: blankToUndefined(payload.diagnosis),
    advice: blankToUndefined(payload.advice),
    items: payload.items
      .map((item) => ({
        name: item.name.trim(),
        dosage: blankToUndefined(item.dosage),
        frequency: blankToUndefined(item.frequency),
        duration: blankToUndefined(item.duration),
        instructions: blankToUndefined(item.instructions),
      }))
      .filter((item) => item.name),
  };
}

export function hasMeaningfulPrescription(payload: PrescriptionPayload) {
  const comparable = toComparablePayload(payload);
  return (
    Boolean(comparable.chief_complaints) ||
    Boolean(comparable.diagnosis) ||
    Boolean(comparable.advice) ||
    comparable.items.length > 0
  );
}

export function isPayloadValidForSave(payload: PrescriptionPayload): boolean {
  return payload.items.every((item) => {
    const hasDetails = [item.dosage, item.frequency, item.duration, item.instructions]
      .some((val) => val && val.trim().length > 0);
    if (hasDetails && !item.name.trim()) {
      return false;
    }
    return true;
  });
}


export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return format(parseISO(value), "dd MMM yyyy, hh:mm a");
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return format(parseISO(value), "dd MMM yyyy");
}
