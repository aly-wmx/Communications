interface Props {
  label: string;
  value: number | string;
  note?: string;
  tone?: 'bad';
  onClick?: () => void;
}

/** Headline number. Clickable tiles drill into the matching records. */
export function Tile({ label, value, note, tone, onClick }: Props) {
  const body = (
    <>
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone === 'bad' ? 'tone-bad' : ''}`}>{value}</span>
      {note && <span className="tile-note">{note}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="tile tile-link" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="tile">{body}</div>
  );
}
