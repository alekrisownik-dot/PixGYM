import { UserError } from "../api";

/**
 * Zmniejsza zdjęcie z aparatu albo galerii przed wysłaniem (12 MP → ok. 300 KB). Ponowne zakodowanie
 * usuwa też metadane, w tym GPS; serwer i tak robi to drugi raz.
 */
export async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  // Z galerii może przyjść coś, czego przeglądarka nie odczyta (np. HEIC z iPhone'a).
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new UserError("Nie umiem odczytać tego pliku. Wybierz zdjęcie JPG albo PNG.");
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
  );
}

export const photoUrl = (id: string, variant: "thumb" | "full" = "thumb") =>
  `/api/v1/exercise-photos/${id}?variant=${variant}`;

export const bodyPhotoUrl = (id: string, variant: "thumb" | "full" = "thumb") => `/api/v1/body/photos/${id}?variant=${variant}`;
