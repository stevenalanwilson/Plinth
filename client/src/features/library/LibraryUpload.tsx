import React, { useRef, useState } from 'react';
import { LibraryData } from '@shared/types';
import { parseAppleMusicXml } from '../../services/libraryParser';

interface LibraryUploadProps {
  libraryData: LibraryData | null;
  onLibraryParsed: (data: LibraryData | null) => void;
}

export function LibraryUpload({ libraryData, onLibraryParsed }: LibraryUploadProps): React.ReactElement {
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File): void {
    setParseError(null);

    if (!file.name.endsWith('.xml')) {
      setParseError('Please select an .xml file exported from Apple Music.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') return;

      try {
        const data = parseAppleMusicXml(content);
        if (data.trackCount === 0) {
          setParseError("No tracks found. Make sure it's an Apple Music library export.");
          return;
        }
        onLibraryParsed(data);
      } catch (err) {
        setParseError(err instanceof Error ? `Could not parse XML: ${err.message}` : 'Could not parse XML.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  }

  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, marginBottom: 40 }}>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, marginBottom: 6 }}>
        Your Apple Music library
      </h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
        Upload your library XML for accurate recommendations. Export from Apple Music: File → Library → Export Library…
      </p>

      {parseError && (
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--danger)', marginBottom: 16, lineHeight: 1.5 }}>
          {parseError}
        </div>
      )}

      {libraryData ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{libraryData.trackCount.toLocaleString()}</span>
          <span style={{ color: 'var(--muted)' }}>tracks</span>
          <span style={{ color: 'var(--border2)' }}>·</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{libraryData.artists.length.toLocaleString()}</span>
          <span style={{ color: 'var(--muted)' }}>artists</span>
          <span style={{ color: 'var(--border2)' }}>·</span>
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{libraryData.albums.length.toLocaleString()}</span>
          <span style={{ color: 'var(--muted)' }}>albums</span>
          <button
            type="button"
            onClick={() => onLibraryParsed(null)}
            style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', padding: '2px 6px' }}
          >
            ✕ clear
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1px dashed ${isDragOver ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius: 10,
            padding: '36px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? 'rgba(200,169,110,0.04)' : 'transparent',
            transition: 'border-color 0.2s, background 0.2s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <div style={{ fontFamily: 'var(--serif)', fontSize: 32, color: 'var(--accent)', marginBottom: 10 }}>♫</div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
            Drop your Library.xml here, or click to browse
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Export from Apple Music: File → Library → Export Library…
          </div>
        </div>
      )}
    </section>
  );
}
