// File: components/dashboard/StandardAlignmentView.js
import React from 'react';

const viewStyle = {
  padding: '0px',
};

const sectionTitleStyle = {
  fontSize: '20px',
  fontWeight: '700',
  color: 'var(--text-headings)',
  marginBottom: '20px',
};

const summaryCardStyle = {
  marginBottom: '24px',
  padding: '20px',
};

const overallScorePStyle = {
  fontSize: '36px',
  fontWeight: 'bold',
  color: 'var(--primary-color)',
  margin: '5px 0 0 0',
};

const overallStatusPStyle = {
  fontSize: '18px',
  fontWeight: '500',
  margin: '5px 0 10px 0',
};

const summaryTextStyle = {
  fontSize: '14px',
  color: 'var(--text-primary)',
  lineHeight: '1.6',
  marginTop: '10px',
};

const findingsTitleStyle = {
  fontSize: '18px',
  fontWeight: '600',
  color: 'var(--text-headings)',
  marginBottom: '16px',
  marginTop: '24px',
};

const getStatusBadgeClass = (status) => {
  if (!status) return 'status-gap';
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('partially')) return 'status-partially-met';
  if (lowerStatus.includes('met')) return 'status-met';
  if (lowerStatus.includes('gap')) return 'status-gap';
  return 'status-developing';
};


const StandardAlignmentView = ({ analysisResults, curriculumName }) => {
  const details = analysisResults?.standardAlignmentDetails || {};
  const overallScore = details.overallScore;
  const overallStatusText = details.overallStatusText || (typeof overallScore === 'number' ? (overallScore >= 75 ? "Aligned" : (overallScore >= 50 ? "Partially Aligned" : "Needs Improvement")) : "N/A");
  const summary = details.summary;
  const findings = details.findings || [];

  let overallStatusColor = 'var(--text-secondary)';
  if (typeof overallScore === 'number') {
    if (overallScore >= 75) overallStatusColor = 'var(--success-green)';
    else if (overallScore >= 50) overallStatusColor = 'var(--secondary-accent-color)';
    else overallStatusColor = '#E74C3C';
  } else if (overallStatusText) {
      const lowerStatus = overallStatusText.toLowerCase();
      if (lowerStatus.includes('aligned') && !lowerStatus.includes('partially')) overallStatusColor = 'var(--success-green)';
      else if (lowerStatus.includes('partially')) overallStatusColor = 'var(--secondary-accent-color)';
      else if (lowerStatus.includes('gap') || lowerStatus.includes('improvement')) overallStatusColor = '#E74C3C';
  }

  return (
    <div style={viewStyle}>
      <h3 style={sectionTitleStyle}>Standard Alignment Analysis: {curriculumName}</h3>

      <div className="card" style={summaryCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '5px', fontSize: '16px', color: 'var(--text-secondary)' }}>Overall Alignment Score</h4>
            <p style={{...overallScorePStyle, color: overallStatusColor}}>
              {typeof overallScore === 'number' ? `${overallScore}%` : 'N/A'}
            </p>
            <p style={{ ...overallStatusPStyle, color: overallStatusColor }}>
              {overallStatusText}
            </p>
          </div>
        </div>
        {summary && (
          <>
            <hr style={{ margin: '20px 0', borderColor: 'var(--border-color)', borderStyle: 'dashed', borderWidth: '0 0 1px 0' }} />
            <p style={summaryTextStyle}><strong>Summary:</strong> {summary}</p>
          </>
        )}
      </div>

      <h4 style={findingsTitleStyle}>Detailed Findings by Standard</h4>
      {findings.length > 0 ? (
        <div className="card data-table-card">
          {/* Ensure no whitespace directly inside table that isn't part of a valid child element */}
          <table className="data-table"><thead>
              <tr>
                <th>Standard ID</th>
                <th>Description</th>
                <th>Alignment</th>
                <th>Coverage</th>
                <th>Evidence/Notes</th>
              </tr>
            </thead><tbody>
              {findings.map((finding) => (
                <tr key={finding.id || finding.standardId}>
                  <td style={{whiteSpace: 'nowrap'}}>{finding.standardId || 'N/A'}</td>
                  <td>{finding.description || 'N/A'}</td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(finding.alignmentStatus)}`}>
                      {finding.alignmentStatus || 'N/A'}
                    </span>
                  </td>
                  <td style={{whiteSpace: 'nowrap'}}>{finding.coverage || 'N/A'}</td>
                  <td>{finding.notes || finding.evidence || 'N/A'}</td>
                </tr>
              ))}
            </tbody></table>
        </div>
      ) : (
        <div className="card">
          <p>No detailed standard alignment findings available for "{curriculumName}".</p>
          <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>
            The 'analysisResults.standardAlignmentDetails.findings' array might be empty or missing in the curriculum data.
          </p>
        </div>
      )}
    </div>
  );
};

export default StandardAlignmentView;
