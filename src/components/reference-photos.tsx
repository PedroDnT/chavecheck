"use client";

import {useEffect, useId, useRef, useState} from "react";
import {Expand, X} from "lucide-react";
import type {ReferencePhoto} from "@/lib/inspection";
import "./reference-photos.css";

interface ReferencePhotosProps {
  photos: ReferencePhoto[];
  title?: string;
  compact?: boolean;
}

export function ReferencePhotos({photos, title = "Fotos do cenário de referência", compact = false}: ReferencePhotosProps) {
  const [preview, setPreview] = useState<ReferencePhoto | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const previewId = useId();

  useEffect(() => {
    if (preview && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [preview]);

  if (!photos.length) return null;

  return <section className={`cc-reference-photos${compact ? " cc-reference-compact" : ""}`} aria-labelledby={headingId}>
    <header className="cc-reference-heading">
      <span className="cc-reference-kind">Referência anterior • cenário fictício</span>
      <h2 id={headingId}>{title}</h2>
    </header>
    <div className="cc-reference-grid">
      {photos.slice(0, 2).map(photo => <figure key={photo.id}>
        <button type="button" className="cc-reference-image" onClick={() => setPreview(photo)} aria-haspopup="dialog" aria-label={`Ampliar referência anterior: ${photo.label}`}>
          <img src={photo.url} alt={photo.description} loading="lazy" width={1448} height={1086}/>
          <span className="cc-reference-expand" aria-hidden="true"><Expand size={14}/>Ampliar</span>
        </button>
        <figcaption><strong>{photo.label}</strong><p>{photo.description}</p></figcaption>
      </figure>)}
    </div>
    <p className="cc-reference-note">{compact?"Textura intencional; a canaleta precisa de aproximação. Amplie as fotos para ver os detalhes da referência.":"A condição esperada foi informada por você; estas fotos mostram apenas as partes visíveis. Variações da textura de cimento queimado, por si só, não indicam avaria. A caixa de fiação inferior aparece parcialmente e precisa de uma aproximação na vistoria atual."}</p>
    <dialog className="cc-reference-dialog cc-no-print" ref={dialogRef} aria-labelledby={previewId} onClose={() => setPreview(null)} onClick={event => {if (event.target === event.currentTarget) dialogRef.current?.close();}}>
      <div className="cc-reference-dialog-body">
        <button type="button" className="icon-button cc-reference-close" onClick={() => dialogRef.current?.close()} aria-label="Fechar foto de referência" autoFocus><X size={22}/></button>
        {preview ? <>
          <img src={preview.url} alt={preview.description}/>
          <div className="cc-reference-dialog-caption"><span className="cc-reference-kind">Referência anterior • cenário fictício</span><h2 id={previewId}>{preview.label}</h2><p>{preview.description}</p></div>
        </> : null}
      </div>
    </dialog>
  </section>;
}
