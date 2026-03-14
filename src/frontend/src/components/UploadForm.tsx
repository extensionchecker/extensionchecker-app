import type { FormEvent } from 'react';
import type { AnalysisProgressEvent } from '@extensionchecker/shared';
import { formatBytes } from '../utils/formatting';

interface UploadFormProps {
  uploadFile: File | null;
  onFileChange: (file: File | null) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isThisSubmitting: boolean;
  progress: AnalysisProgressEvent | null;
  onSubmit: (event: FormEvent) => void;
}

export function UploadForm({
  uploadFile,
  onFileChange,
  canSubmit,
  isSubmitting,
  isThisSubmitting,
  progress,
  onSubmit
}: UploadFormProps) {
  return (
    <form onSubmit={onSubmit} className="form intake-panel intake-panel-secondary" role="tabpanel" id="intake-panel-upload" aria-labelledby="intake-tab-upload">
      <div className="panel-copy-block">
        <p className="panel-label">Upload package</p>
        <p className="panel-description">Use this when you already have the extension file.</p>
      </div>

      <label htmlFor="package-file">Extension package file</label>
      <input
        id="package-file"
        type="file"
        accept=".zip,.xpi,.crx"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />

      {uploadFile ? (
        <p className="field-hint">Ready to analyze <strong>{uploadFile.name}</strong> ({formatBytes(uploadFile.size)}).</p>
      ) : (
        <p className="field-hint">Accepted formats: <code>.crx</code>, <code>.xpi</code>, <code>.zip</code>.</p>
      )}

      <div className="intake-panel-footer">
        <div className="form-actions">
          <button type="submit" className="secondary-button" disabled={!canSubmit || isSubmitting} aria-busy={isThisSubmitting}>
            <span className="button-content">
              {isThisSubmitting ? (
                <span className="button-loading">
                  <span className="button-spinner" aria-hidden="true" />
                  {progress ? progress.message : 'Uploading\u2026'}
                </span>
              ) : (
                <>
                  <span className="material-symbols-outlined button-icon" aria-hidden="true">upload</span>
                  Analyze Upload
                </>
              )}
            </span>
          </button>
        </div>

        <div className="use-for-card" aria-label="Use upload for Chrome, Firefox, Edge, Opera, and Safari extensions">
          <span className="use-for-label">Use for:</span>
          <span className="use-for-icons" aria-hidden="true">
            <img className="use-for-icon" src="/browser-icons/icon_chrome.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_firefox.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_edge.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_opera.png" alt="" />
            <img className="use-for-icon" src="/browser-icons/icon_safari.png" alt="" />
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
