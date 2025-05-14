// File: components/dashboard/GapAnalysisView.js
import React from 'react';

// Reusable styles (can be moved to a CSS Module)
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

const summaryTextStyle = {
  fontSize: '14px',
  color: 'var(--text-primary)',
  lineHeight: '1.6',
  marginTop: '10px',
};

const gapItemStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius)',
  padding: '15px',
  marginBottom: '15px',
  backgroundColor: '#fff', // White background for each gap item card
};

const gapHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '10px',
};

const gapAreaStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: 'var(--primary-color)',
};

const getSeverityBadgeClass = (severity) => {
  if (!severity) return 'status-developing'; // Default
  const lowerSeverity = severity.toLowerCase();
  if (lowerSeverity === 'high') return 'status-gap'; // Red
  if (lowerSeverity === 'medium') return 'status-partially-met'; // Orange
  if (lowerSeverity === 'low') return 'status-met'; // Green (or a light blue/grey for low severity)
  return 'status-developing'; // Default
};

const GapAnalysisView = ({ analysisResults, curriculumName }) => {
  const gapData = analysisResults?.gapAnalysis || {};
  const summary = gapData.summary;
  const identifiedGaps = gapData.identifiedGaps || [];
  const overallGapScore = gapData.overallGapScore; // Example: a score indicating overall "gappiness"

  return (
    <div style={viewStyle}>
      <h3 style={sectionTitleStyle}>Gap Analysis: {curriculumName}</h3>

      {summary && (
        <div className="card" style={summaryCardStyle}>
          <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px' }}>Analysis Summary</h4>
          <p style={summaryTextStyle}>{summary}</p>
          {typeof overallGapScore === 'number' && (
            <p style={{...summaryTextStyle, marginTop: '15px', fontWeight: 'bold'}}>
              Overall Gap Score: <span style={{color: overallGapScore > 50 ? '#E74C3C' : 'var(--primary-color)'}}>{overallGapScore}%</span>
            </p>
          )}
        </div>
      )}

      {identifiedGaps.length > 0 ? (
        <div>
          {identifiedGaps.map((gap) => (
            <div key={gap.id || gap.area} className="card" style={gapItemStyle}>
              <div style={gapHeaderStyle}>
                <h5 style={gapAreaStyle}>{gap.area || 'Unspecified Area'}</h5>
                {gap.severity && (
                  <span className={`status-badge ${getSeverityBadgeClass(gap.severity)}`}>
                    Severity: {gap.severity}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '14px', marginBottom: '10px' }}>{gap.description || 'No description provided.'}</p>
              {gap.recommendations && gap.recommendations.length > 0 && (
                <div>
                  <strong style={{ fontSize: '13px' }}>Recommendations:</strong>
                  <ul style={{ listStyleType: 'disc', paddingLeft: '20px', fontSize: '13px', margin: '5px 0 0 0' }}>
                    {gap.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <p>No specific curriculum gaps identified in the analysis results for "{curriculumName}".</p>
          <p style={{fontSize: '13px', color: 'var(--text-secondary)'}}>
            The 'analysisResults.gapAnalysis.identifiedGaps' array might be empty or missing.
          </p>
        </div>
      )}
    </div>
  );
};

export default GapAnalysisView;
