import { useState, type FormEvent } from 'react';
import type { AnalysisProgressEvent } from '@extensionchecker/shared';
import type { IntakeTab, SmartSubmissionState } from '../types';
import { PasteForm } from '../components/PasteForm';
import { UploadForm } from '../components/UploadForm';

interface ScanPageProps {
  textInput: string;
  onTextChange: (value: string) => void;
  smartSubmission: SmartSubmissionState;
  canSubmitText: boolean;
  uploadFile: File | null;
  onFileChange: (file: File | null) => void;
  canSubmitUpload: boolean;
  isSubmitting: boolean;
  textSubmitting: boolean;
  uploadSubmitting: boolean;
  progress: AnalysisProgressEvent | null;
  error: string | null;
  onSubmitText: (event: FormEvent) => void;
  onSubmitUpload: (event: FormEvent) => void;
}

export function ScanPage({
  textInput,
  onTextChange,
  smartSubmission,
  canSubmitText,
  uploadFile,
  onFileChange,
  canSubmitUpload,
  isSubmitting,
  textSubmitting,
  uploadSubmitting,
  progress,
  error,
  onSubmitText,
  onSubmitUpload
}: ScanPageProps) {
  const [intakeTab, setIntakeTab] = useState<IntakeTab>('paste');
  const pasteTabSelected = intakeTab === 'paste';
  const uploadTabSelected = intakeTab === 'upload';

  const handleTextChange = (value: string) => {
    onTextChange(value);
    if (intakeTab !== 'paste') {
      setIntakeTab('paste');
    }
  };

  const handleFileChange = (file: File | null) => {
    onFileChange(file);
    if (intakeTab !== 'upload') {
      setIntakeTab('upload');
    }
  };

  return (
    <section id="analysis-intake" className="intake">
      <div className="intake-head">
        <div className="intake-copy">
          <p className="intake-label">Input</p>
          <p className="description">Paste a store URL, package URL, or extension ID. Upload a package when you already have the file.</p>
        </div>
      </div>

      <div className="intake-tabs" role="tablist" aria-label="Input options">
        <button
          type="button"
          role="tab"
          id="intake-tab-paste"
          aria-selected={pasteTabSelected}
          aria-controls="intake-panel-paste"
          className={`intake-tab-button${pasteTabSelected ? ' is-active' : ''}`}
          onClick={() => setIntakeTab('paste')}
        >
          <span className="material-symbols-outlined intake-tab-title-icon" aria-hidden="true">content_paste</span>
          <span className="intake-tab-label">Paste</span>
        </button>
        <button
          type="button"
          role="tab"
          id="intake-tab-upload"
          aria-selected={uploadTabSelected}
          aria-controls="intake-panel-upload"
          className={`intake-tab-button${uploadTabSelected ? ' is-active' : ''}`}
          onClick={() => setIntakeTab('upload')}
        >
          <span className="material-symbols-outlined intake-tab-title-icon" aria-hidden="true">upload</span>
          <span className="intake-tab-label">Upload</span>
        </button>
      </div>

      <div className="intake-layout">
        {pasteTabSelected ? (
          <PasteForm
            textInput={textInput}
            onTextChange={handleTextChange}
            smartSubmission={smartSubmission}
            canSubmit={canSubmitText}
            isSubmitting={isSubmitting}
            isThisSubmitting={textSubmitting}
            progress={progress}
            onSubmit={onSubmitText}
          />
        ) : null}

        {uploadTabSelected ? (
          <UploadForm
            uploadFile={uploadFile}
            onFileChange={handleFileChange}
            canSubmit={canSubmitUpload}
            isSubmitting={isSubmitting}
            isThisSubmitting={uploadSubmitting}
            progress={progress}
            onSubmit={onSubmitUpload}
          />
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
