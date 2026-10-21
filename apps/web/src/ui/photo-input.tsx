import { useRef, type ReactNode } from "react";

/**
 * Zdjęcie z aparatu albo z galerii. Pole z `capture` na Androidzie od razu otwiera aparat,
 * więc galeria potrzebuje osobnego pola (bez `capture`).
 */
export function usePhotoPicker(onFile: (f: File) => void, facing: "user" | "environment" = "environment") {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Czyścimy od razu: wybranie tego samego pliku drugi raz też wywoła zmianę.
    e.target.value = "";
    if (f) onFile(f);
  };
  const inputs: ReactNode = (
    <>
      <input ref={camera} type="file" accept="image/*" capture={facing} className="hidden" onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={pick} />
    </>
  );
  return { inputs, openCamera: () => camera.current?.click(), openGallery: () => gallery.current?.click() };
}
