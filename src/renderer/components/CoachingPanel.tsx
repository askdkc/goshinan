import { formatPoint } from "../../domain/coordinates";
import type { Language } from "../../shared/contracts";
import type { Translator } from "../i18n";
import type { CoachingState } from "../sessionReducer";

interface CoachingPanelProps {
  coaching: CoachingState;
  language: Language;
  onHint: () => void;
  t: Translator;
}

export function CoachingPanel({
  coaching,
  language,
  onHint,
  t,
}: CoachingPanelProps) {
  const pv = coaching.evidence.principalVariation ?? [];
  return (
    <section className="coaching-panel" aria-live="polite">
      <div className="eyebrow">{t("coaching")}</div>
      <h2>{t(coaching.explanation.messageKey)}</h2>
      <div className="coach-metrics">
        <div>
          <span>{t("scoreLoss")}</span>
          <strong>
            {coaching.assessment.scoreLoss.toFixed(1)} {t("points")}
          </strong>
        </div>
        {coaching.hintLevel >= 3 && (
          <div>
            <span>{t("candidateLabel")}</span>
            <strong>{formatPoint(coaching.recommended, language)}</strong>
          </div>
        )}
      </div>
      {coaching.hintLevel >= 2 &&
        coaching.explanation.affectedRegion.length > 0 && (
          <p className="hint-line">
            {t("recommendedRegion")}:{" "}
            {coaching.explanation.affectedRegion
              .map((point) => formatPoint(point, language))
              .join(", ")}
          </p>
        )}
      {coaching.hintLevel >= 4 && pv.length > 0 && (
        <div className="variation">
          <span>{t("principalVariation")}</span>
          <ol>
            {pv.slice(0, 8).map((move, index) => (
              <li key={`${move}-${index}`}>{move}</li>
            ))}
          </ol>
        </div>
      )}
      <p>{t("tryAgain")}</p>
      {coaching.hintLevel < 4 && (
        <button className="button button-accent" onClick={onHint}>
          {t("revealHint")}
        </button>
      )}
    </section>
  );
}
