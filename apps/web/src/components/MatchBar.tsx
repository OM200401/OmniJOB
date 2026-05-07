type Props = {
  /** Cosine similarity in [-1, 1] (typically [0, 1] for our embeddings). */
  score: number;
  showPct?: boolean;
};

export function MatchBar({ score, showPct = true }: Props) {
  const pct = Math.max(0, Math.min(1, (score + 1) / 2 < 0.5 ? score : score));
  const display = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return (
    <div className="match" aria-label={`${display}% match`}>
      {showPct && <span className="match-pct">{display}%</span>}
      <div className="match-bar" role="progressbar" aria-valuenow={display} aria-valuemin={0} aria-valuemax={100}>
        <span className="match-fill" style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
    </div>
  );
}
