import type { FormEvent } from 'react';
import type { AnalysisProgressEvent } from '@extensionchecker/shared';
import type { SmartSubmissionState } from '../types';

interface PasteFormProps {
  textInput: string;
  onTextChange: (value: string) => void;
  smartSubmission: SmartSubmissionState;
  canSubmit: boolean;
  isSubmitting: boolean;
  isThisSubmitting: boolean;
  progress: AnalysisProgressEvent | null;
  onSubmit: (event: FormEvent) => void;
}

export function PasteForm({
  textInput,
  onTextChange,
  smartSubmission,
  canSubmit,
  isSubmitting,
  isThisSubmitting,
  progress,
  onSubmit
}: PasteFormProps) {
  return (
    <form onSubmit={onSubmit} className="form intake-panel intake-panel-primary" role="tabpanel" id="intake-panel-paste" aria-labelledby="intake-tab-paste">
      <div className="panel-copy-block">
        <p className="panel-label">Paste a URL or ID</p>
        <p className="panel-description">Chrome, Firefox, and Edge links or IDs work here.</p>
      </div>

      <label htmlFor="analysis-source">Extension URL or ID</label>
      <input
        id="analysis-source"
        type="text"
        placeholder="Paste a store URL, package URL, or extension ID"
        value={textInput}
        onChange={(event) => onTextChange(event.target.value)}
      />

      {smartSubmission.detectionLabel ? (
        <p className={`browser-detection browser-${smartSubmission.browser ?? 'generic'}`}>
          {smartSubmission.detectionIconSrc ? (
            <img className="browser-detection-image" src={smartSubmission.detectionIconSrc} alt="" aria-hidden="true" />
          ) : null}
          {smartSubmission.detectionLabel}
        </p>
      ) : null}

      {smartSubmission.helperMessage ? (
        <p className="field-hint warning">{smartSubmission.helperMessage}</p>
      ) : null}

      <div className="intake-panel-footer">
        <div className="form-actions">
          <button type="submit" disabled={!canSubmit || isSubmitting} aria-busy={isThisSubmitting}>
            <span className="button-content">
              {isThisSubmitting ? (
                <span className="button-loading">
                  <span className="button-spinner" aria-hidden="true" />
                  {progress ? progress.message : 'Analyzing\u2026'}
                </span>
              ) : (
                <>
                  <span className="material-symbols-outlined button-icon" aria-hidden="true">search</span>
                  Analyze
                </>
              )}
            </span>
          </button>
        </div>

        <div className="use-for-card" aria-label="Use paste for Chrome, Firefox, Edge, and Opera extensions">
          <span className="use-for-label">Use for:</span>
          <span className="use-for-icons" aria-hidden="true">
            <img className="use-for-icon" src="/browser-icons/icon_chrome.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_firefox.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_edge.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_opera.png" alt="" />
          </span>
        </div>
      </div>

      {isThisSubmitting && progress ? (
        <div className="analysis-progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={progress.message}>
          <div className="analysis-progress-track">
            <div className="analysis-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="analysis-progress-label">{progress.message}</span>
        </div>
      ) : null}
    </form>
  );
}
