// File: components/dashboard/IndustryAlignmentView.js
import React from 'react';

// Reusable styles
const viewStyle = { /* ... */ padding: '0px' };
const sectionTitleStyle = { /* ... */ fontSize: '20px', fontWeight: '700', color: 'var(--text-headings)', marginBottom: '20px' };
const subSectionTitleStyle = { /* ... */ fontSize: '18px', fontWeight: '600', color: 'var(--text-headings)', marginBottom: '16px', marginTop: '24px' };
const regionDisplayStyle = { fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' };
const summaryCardStyle = { /* ... */ marginBottom: '24px', padding: '20px' };
const summaryTextStyle = { /* ... */ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6', marginTop: '10px' };

const industryListStyle = { listStyle: 'none', padding: 0, marginTop: '0px' }; // Removed top margin
const industryListItemStyle = {
  padding: '10px 0',
  borderBottom: '1px dashed var(--border-color)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start', // Align items to top for multi-line text
  fontSize: '14px',
  flexWrap: 'nowrap', // Prevent wrapping of name and growth for now
  gap: '15px',
};
const industryListItemNameStyle = {
  fontWeight: 500,
  color: 'var(--text-primary)',
  flexGrow: 1,
  marginRight: '10px', // Add some space
};
const industryListItemGrowthStyle = {
  fontSize: '13px',
  color: 'var(--success-green)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  flexShrink: 0, // Prevent growth text from shrinking
};
const industryListItemSkillsStyle = {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
    paddingLeft: '10px', // Indent skills a bit
    width: '100%', // Allow skills to take full width if they wrap
};


const getStatusBadgeClass = (statusText) => {
  if (!statusText) return 'status-developing';
  const lowerStatus = statusText.toLowerCase();
  if (lowerStatus.includes('fully met') || (lowerStatus.includes('met') && !lowerStatus.includes('partially'))) return 'status-met';
  if (lowerStatus.includes('partially met')) return 'status-partially-met';
  if (lowerStatus.includes('gap')) return 'status-gap';
  return 'status-developing';
};

const IndustryAlignmentView = ({ analysisResults, curriculumName }) => {
  const industryData = analysisResults?.regionalIndustryAlignment || {};
  const region = industryData.region || "Region N/A"; // Get region from data or default
  const summary = industryData.summary;
  const topIndustries = industryData.topHighGrowthIndustries || [];
  const alignmentTableData = industryData.curriculumAlignmentWithKeyIndustries || [];

  return (
    <div style={viewStyle}>
      <h3 style={sectionTitleStyle}>Regional Industry Alignment: {curriculumName}</h3>
      <p style={regionDisplayStyle}>
        Target Region: <strong style={{ color: 'var(--text-primary)' }}>{region}</strong>
      </p>

      {summary && (
        <div className="card" style={summaryCardStyle}>
          <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px' }}>Alignment Summary</h4>
          <p style={summaryTextStyle}>{summary}</p>
        </div>
      )}
      
      <div className="card" style={{ marginBottom: '24px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Top High-Growth Industries ({region})</h4>
        {topIndustries.length > 0 ? (
            <ul style={industryListStyle}>
            {topIndustries.map((industry) => (
                <li key={industry.id || industry.name} style={industryListItemStyle}>
                <div style={{flexGrow: 1}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span style={industryListItemNameStyle}>{industry.name}</span>
                        <span style={industryListItemGrowthStyle}>
                            {industry.projectedGrowth || 'N/A'}
                        </span>
                    </div>
                    {industry.keySkillsNeeded && industry.keySkillsNeeded.length > 0 && (
                        <div style={industryListItemSkillsStyle}>
                            <strong>Key Skills:</strong> {industry.keySkillsNeeded.join(', ')}
                        </div>
                    )}
                </div>
                </li>
            ))}
            </ul>
        ) : (
            <p>No high-growth industry data available for this region in the analysis results.</p>
        )}
      </div>

      <h4 style={subSectionTitleStyle}>Curriculum Alignment with Key Industries</h4>
      {alignmentTableData.length > 0 ? (
        <div className="card data-table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Industry Sector</th>
                <th>Relevant Pathways/Courses</th>
                <th>Alignment Status</th>
                <th>Skills Covered</th>
                <th>Identified Gaps</th>
                <th>Opportunities</th>
              </tr>
            </thead>
            <tbody>
              {alignmentTableData.map((row) => (
                <tr key={row.id || row.industrySector}>
                  <td style={{ fontWeight: 500 }}>{row.industrySector || 'N/A'}</td>
                  <td>{row.relevantPathways || 'N/A'}</td>
                  <td>
                    <span className={`status-badge ${getStatusBadgeClass(row.alignmentStatusText)}`}>
                      {row.alignmentStatusText || 'N/A'}
                      {typeof row.alignmentScorePercent === 'number' && ` (${row.alignmentScorePercent}%)`}
                    </span>
                  </td>
                  <td>{(row.keySkillsCovered || []).join(', ') || 'N/A'}</td>
                  <td style={{color: 'var(--secondary-accent-color)'}}>{(row.identifiedGaps || []).join('; ') || 'N/A'}</td>
                  <td style={{color: 'var(--success-green)'}}>{(row.opportunities || []).join('; ') || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <p>No detailed industry alignment data available for "{curriculumName}".</p>
        </div>
      )}
    </div>
  );
};

export default IndustryAlignmentView;
