import type { AnalysisReport } from '@extensionchecker/shared';
import { formatBytes } from '../utils/formatting';
import { sourceStoreLabel } from '../utils/report-source';

interface MetadataPanelProps {
  report: AnalysisReport;
}

export function MetadataPanel({ report }: MetadataPanelProps) {
  return (
    <section id="result-panel-metadata" role="tabpanel" aria-labelledby="result-tab-metadata" className="result-panel">
      <section className="metadata-section">
        <h3>Extension Metadata</h3>
        <div className="metadata-grid">
          <article className="info-card info">
            <h4>Package Details</h4>
            <dl className="metadata-list">
              <dt>Extension Name</dt>
              <dd>{report.metadata.name}</dd>
              <dt>Version</dt>
              <dd>{report.metadata.version}</dd>
              <dt>Manifest Version</dt>
              <dd>MV{report.metadata.manifestVersion}</dd>
              {report.storeMetadata?.shortName ? (
                <>
                  <dt>Short Name</dt>
                  <dd>{report.storeMetadata.shortName}</dd>
                </>
              ) : null}
              {report.storeMetadata?.packageSizeBytes ? (
                <>
                  <dt>Package Size</dt>
                  <dd>{formatBytes(report.storeMetadata.packageSizeBytes)}</dd>
                </>
              ) : null}
            </dl>
          </article>

          <article className="info-card info">
            <h4>Developer Information</h4>
            <dl className="metadata-list">
              {report.storeMetadata?.author ? (
                <>
                  <dt>Author</dt>
                  <dd>{report.storeMetadata.author}</dd>
                </>
              ) : null}
              {report.storeMetadata?.developerName ? (
                <>
                  <dt>Developer</dt>
                  <dd>{report.storeMetadata.developerName}</dd>
                </>
              ) : null}
              {report.storeMetadata?.developerUrl ? (
                <>
                  <dt>Developer Website</dt>
                  <dd>
                    <a href={report.storeMetadata.developerUrl} target="_blank" rel="noopener noreferrer">
                      {report.storeMetadata.developerUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {report.storeMetadata?.homepageUrl ? (
                <>
                  <dt>Homepage</dt>
                  <dd>
                    <a href={report.storeMetadata.homepageUrl} target="_blank" rel="noopener noreferrer">
                      {report.storeMetadata.homepageUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {!report.storeMetadata?.author && !report.storeMetadata?.developerName && !report.storeMetadata?.developerUrl && !report.storeMetadata?.homepageUrl ? (
                <p className="empty-signals">No developer information available in the manifest.</p>
              ) : null}
            </dl>
          </article>

          <article className="info-card info">
            <h4>Store &amp; Source</h4>
            <dl className="metadata-list">
              <dt>Submission Source</dt>
              <dd>{sourceStoreLabel(report)}</dd>
              {report.storeMetadata?.storeUrl ? (
                <>
                  <dt>Store Listing</dt>
                  <dd>
                    <a href={report.storeMetadata.storeUrl} target="_blank" rel="noopener noreferrer">
                      {report.storeMetadata.storeUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {report.storeMetadata?.category ? (
                <>
                  <dt>Category</dt>
                  <dd>{report.storeMetadata.category}</dd>
                </>
              ) : null}
              {report.storeMetadata?.rating !== undefined ? (
                <>
                  <dt>Rating</dt>
                  <dd>{report.storeMetadata.rating.toFixed(1)} / 5{report.storeMetadata.ratingCount !== undefined ? ` (${report.storeMetadata.ratingCount.toLocaleString()} ratings)` : ''}</dd>
                </>
              ) : null}
              {report.storeMetadata?.userCount !== undefined ? (
                <>
                  <dt>Users</dt>
                  <dd>{report.storeMetadata.userCount.toLocaleString()}</dd>
                </>
              ) : null}
              {report.storeMetadata?.lastUpdated ? (
                <>
                  <dt>Last Updated</dt>
                  <dd>{report.storeMetadata.lastUpdated}</dd>
                </>
              ) : null}
            </dl>
          </article>
        </div>

        {report.storeMetadata?.description ? (
          <article className="info-card info metadata-description">
            <h4>Extension Description</h4>
            <p>{report.storeMetadata.description}</p>
          </article>
        ) : null}

        {report.storeMetadata?.privacyPolicyUrl || report.storeMetadata?.supportUrl ? (
          <article className="info-card info">
            <h4>Additional Links</h4>
            <dl className="metadata-list">
              {report.storeMetadata.privacyPolicyUrl ? (
                <>
                  <dt>Privacy Policy</dt>
                  <dd>
                    <a href={report.storeMetadata.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">
                      {report.storeMetadata.privacyPolicyUrl}
                    </a>
                  </dd>
                </>
              ) : null}
              {report.storeMetadata.supportUrl ? (
                <>
                  <dt>Support</dt>
                  <dd>
                    <a href={report.storeMetadata.supportUrl} target="_blank" rel="noopener noreferrer">
                      {report.storeMetadata.supportUrl}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          </article>
        ) : null}
      </section>
    </section>
  );
}
