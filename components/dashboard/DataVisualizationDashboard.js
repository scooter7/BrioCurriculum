// File: components/dashboard/DataVisualizationDashboard.js
import React, { useState, useEffect } from 'react';
import StandardAlignmentView from './StandardAlignmentView';
import GapAnalysisView from './GapAnalysisView';
// ResourceCheckView was removed
import IndustryAlignmentView from './IndustryAlignmentView';

const dashboardStyle = { /* ... same ... */ };
const loadingTextStyle = { /* ... same ... */ };
const errorTextStyle = { /* ... same ... */ };
const emptyStateTextStyle = { /* ... same ... */ };
const processingMessageStyle = {
  padding: '10px', 
  marginBottom: '15px', 
  borderRadius: 'var(--border-radius)', 
  backgroundColor: '#e6f7ff', // Light blue
  border: '1px solid var(--primary-color)',
  color: 'var(--primary-color)',
  textAlign: 'center',
  fontStyle: 'italic',
};

const DataVisualizationDashboard = ({ 
    selectedCurriculum, 
    isLoading, // For initial load of curriculum details
    error, 
    onTriggerAnalysis, // Function to call when "Run/Refresh Analysis" is clicked
    analysisTriggerMessage // Message like "Processing..." from HomePage
}) => {
  const [activeView, setActiveView] = useState('standardAlignment');
  // isAnalyzing state is now managed by HomePage via analysisTriggerMessage and selectedCurriculum.analysisStatus

  const curriculumName = selectedCurriculum ? selectedCurriculum.name : "No curriculum selected";
  // analysisResults, analysisStatus, analysisError now come directly from selectedCurriculum prop
  const analysisResults = selectedCurriculum?.analysisResults || {};
  const analysisStatus = selectedCurriculum?.analysisStatus;
  const analysisError = selectedCurriculum?.analysisError;

  useEffect(() => {
    if (selectedCurriculum && (!activeView || activeView === 'resourceCheck')) { // Reset if old view was removed
      setActiveView('standardAlignment');
    }
    // If analysis is completed or failed, clear the trigger message from HomePage
    // This might be better handled in HomePage itself based on polling result.
  }, [selectedCurriculum, activeView]);

  const handleRunAnalysisClick = () => {
    if (selectedCurriculum && onTriggerAnalysis) {
      onTriggerAnalysis(selectedCurriculum.id);
    }
  };

  if (isLoading && !selectedCurriculum) { // Initial loading of selected curriculum details
    return (
      <section style={dashboardStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
        <p style={loadingTextStyle}>Loading curriculum details...</p>
      </section>
    );
  }

  // Error loading the curriculum itself
  if (error && !selectedCurriculum) {
    return (
      <section style={dashboardStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
        <p style={errorTextStyle}>Error loading curriculum details: {error}</p>
      </section>
    );
  }
  
  // No curriculum selected (after initial GSSP load attempt)
  if (!selectedCurriculum && !isLoading) {
     return (
      <section style={dashboardStyle} aria-labelledby="dashboard-title-empty">
        <div>
          <h1 id="dashboard-title-empty" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-headings)' }}>
              Curriculum Analysis Dashboard
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '24px' }}>
              Please select a curriculum from the sidebar to view its analysis.
          </p>
        </div>
        <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-tab" disabled>Standard Alignment</button>
            <button className="btn btn-tab" disabled>Gap Analysis</button>
            <button className="btn btn-tab" disabled>Regional Industry Alignment</button>
        </div>
        <div style={emptyStateTextStyle}>No curriculum selected.</div>
      </section>
    );
  }

  const renderView = () => {
    // Display analysis error if present
    if (analysisStatus === "FAILED" && analysisError) {
      return <p style={errorTextStyle}>Analysis Failed: {analysisError}</p>;
    }
    // Display processing status
    if (analysisStatus === "PROCESSING" || analysisStatus === "PENDING") {
      return <p style={loadingTextStyle}>Analysis is currently processing... Please check back shortly.</p>;
    }
    // If completed, render the active view with results
    if (analysisStatus === "COMPLETED") {
      switch (activeView) {
        case 'standardAlignment':
          return <StandardAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} />;
        case 'gapAnalysis':
          return <GapAnalysisView analysisResults={analysisResults} curriculumName={curriculumName} />;
        case 'industryAlignment':
          return <IndustryAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} region={analysisResults?.regionalIndustryAlignment?.region || "Central Oklahoma"} />;
        default:
          return <StandardAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} />;
      }
    }
    // Default message if no specific status or before first analysis
    return <p style={emptyStateTextStyle}>Analysis results will appear here once processed. Click "Run/Refresh Analysis".</p>;
  };

  return (
    <section style={dashboardStyle} aria-labelledby="dashboard-title">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px'}}>
        <div>
            <h1 id="dashboard-title" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-headings)' }}>
                Curriculum Analysis Dashboard
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '24px' }}>
                Analyzing: <strong style={{color: 'var(--text-primary)'}}>{curriculumName}</strong>
            </p>
        </div>
        {selectedCurriculum && (
            <button 
                className="btn btn-secondary" 
                onClick={handleRunAnalysisClick}
                disabled={analysisStatus === "PROCESSING"} // Disable if already processing
                style={{marginBottom: '20px', minWidth: '180px'}}
            >
                {analysisStatus === "PROCESSING" ? 'Analysis In Progress...' : 'Run/Refresh Analysis'}
            </button>
        )}
      </div>

      {/* Display message from HomePage about triggering analysis */}
      {analysisTriggerMessage && analysisStatus !== "COMPLETED" && analysisStatus !== "FAILED" && (
        <p style={processingMessageStyle}>{analysisTriggerMessage}</p>
      )}
      
      {/* Display analysis error directly if it exists (from selectedCurriculumDetails) */}
      {analysisStatus === "FAILED" && analysisError && (
         <p style={{...errorTextStyle, marginBottom: '15px'}}>Analysis Error: {analysisError}</p>
      )}


      <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-tab ${activeView === 'standardAlignment' ? 'active' : ''}`}
          onClick={() => setActiveView('standardAlignment')}
          disabled={!selectedCurriculum || analysisStatus === "PROCESSING"}
        >
          Standard Alignment
        </button>
        <button
          className={`btn btn-tab ${activeView === 'gapAnalysis' ? 'active' : ''}`}
          onClick={() => setActiveView('gapAnalysis')}
          disabled={!selectedCurriculum || analysisStatus === "PROCESSING"}
        >
          Gap Analysis
        </button>
        <button
          className={`btn btn-tab ${activeView === 'industryAlignment' ? 'active' : ''}`}
          onClick={() => setActiveView('industryAlignment')}
          disabled={!selectedCurriculum || analysisStatus === "PROCESSING"}
        >
          Regional Industry Alignment
        </button>
      </div>

      <div className="dashboard-view-content-area">
        {renderView()}
      </div>
    </section>
  );
};

// Ensure all style consts are defined as in previous versions or moved to CSS modules.
// const dashboardStyle = { ... };
// const sectionTitleStyle = { ... };
// const loadingTextStyle = { ... };
// const errorTextStyle = { ... };
// const emptyStateTextStyle = { ... };

export default DataVisualizationDashboard;
