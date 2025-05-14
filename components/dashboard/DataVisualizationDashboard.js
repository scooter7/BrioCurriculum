// File: components/dashboard/DataVisualizationDashboard.js
import React, { useState, useEffect } from 'react';
import StandardAlignmentView from './StandardAlignmentView';
import GapAnalysisView from './GapAnalysisView';
// import ResourceCheckView from './ResourceCheckView'; // Removed import
import IndustryAlignmentView from './IndustryAlignmentView';

// Styles (ensure these are complete from previous versions)
const dashboardStyle = {
  backgroundColor: '#FFFFFF',
  padding: '24px',
  borderRadius: 'var(--border-radius)',
  boxShadow: 'var(--card-shadow)',
  marginBottom: '32px',
};

const sectionTitleStyle = { // This might be used within sub-components now
  fontSize: '20px',
  fontWeight: '700',
  marginBottom: '16px',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '8px',
  color: 'var(--text-headings)',
};

const loadingTextStyle = {
  padding: '20px',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  fontSize: '16px',
  fontStyle: 'italic',
};

const errorTextStyle = {
  padding: '20px',
  color: 'red',
  textAlign: 'center',
  border: '1px solid red',
  borderRadius: 'var(--border-radius)',
  backgroundColor: '#ffe0e0',
  fontSize: '16px',
};

const emptyStateTextStyle = {
    padding: '20px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    fontSize: '16px',
    fontStyle: 'italic',
    border: '1px dashed var(--border-color)',
    borderRadius: 'var(--border-radius)',
    backgroundColor: '#f9f9f9',
};


const DataVisualizationDashboard = ({ selectedCurriculum, isLoading, error, onAnalysisComplete }) => {
  // Default to 'standardAlignment' if 'resourceCheck' was the previous default and it's removed
  const [activeView, setActiveView] = useState('standardAlignment');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');

  const curriculumName = selectedCurriculum ? selectedCurriculum.name : "No curriculum selected";
  const [currentAnalysisResults, setCurrentAnalysisResults] = useState(selectedCurriculum?.analysisResults || {});

  useEffect(() => {
    setCurrentAnalysisResults(selectedCurriculum?.analysisResults || {});
    setAnalysisMessage('');
    // If the activeView was 'resourceCheck' and it's now removed, default to 'standardAlignment'
    if (activeView === 'resourceCheck') {
        setActiveView('standardAlignment');
    } else if (selectedCurriculum && !activeView) {
      setActiveView('standardAlignment');
    }
  }, [selectedCurriculum, activeView]); // Keep activeView in dependency array

  const handleRunAnalysis = async () => {
    if (!selectedCurriculum || !selectedCurriculum.id) {
      setAnalysisMessage("Please select a curriculum first.");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisMessage('');
    try {
      const response = await fetch(`/api/curricula/${selectedCurriculum.id}/analyze`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Analysis failed: ${response.status}`);
      }
      setAnalysisMessage(result.message || "Analysis complete!");
      if (result.curriculum && result.curriculum.analysisResults) {
        setCurrentAnalysisResults(result.curriculum.analysisResults);
      }
      if (onAnalysisComplete) {
        onAnalysisComplete(result.curriculum);
      }
    } catch (err) {
      console.error("Analysis error:", err);
      setAnalysisMessage(`Analysis Error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading && !selectedCurriculum) {
    return (
      <section style={dashboardStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
        <p style={loadingTextStyle}>Loading curriculum details...</p>
      </section>
    );
  }

  if (error && !selectedCurriculum) {
    return (
      <section style={dashboardStyle}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
        <p style={errorTextStyle}>Error loading details: {error}</p>
      </section>
    );
  }
  
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
            <button className="btn btn-tab" style={{marginRight:0}} disabled>Standard Alignment</button>
            <button className="btn btn-tab" style={{marginRight:0}} disabled>Gap Analysis</button>
            {/* Resource Check button removed */}
            <button className="btn btn-tab" disabled>Regional Industry Alignment</button>
        </div>
        <div style={emptyStateTextStyle}>
            No curriculum selected.
        </div>
      </section>
    );
  }

  const renderView = () => {
    if (!selectedCurriculum) {
        return <div style={emptyStateTextStyle}>Please select a curriculum to see details.</div>;
    }
    
    switch (activeView) {
      case 'standardAlignment':
        return <StandardAlignmentView analysisResults={currentAnalysisResults} curriculumName={curriculumName} />;
      case 'gapAnalysis':
        return <GapAnalysisView analysisResults={currentAnalysisResults} curriculumName={curriculumName} />;
      // case 'resourceCheck': // Removed case
      //   return <ResourceCheckView analysisResults={currentAnalysisResults} curriculumName={curriculumName} />;
      case 'industryAlignment':
        return <IndustryAlignmentView analysisResults={currentAnalysisResults} curriculumName={curriculumName} region={currentAnalysisResults?.regionalIndustryAlignment?.region || selectedCurriculum.region || "Central Oklahoma"} />;
      default:
        return <StandardAlignmentView analysisResults={currentAnalysisResults} curriculumName={curriculumName} />;
    }
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
                onClick={handleRunAnalysis} 
                disabled={isAnalyzing}
                style={{marginBottom: '20px', minWidth: '180px'}}
            >
                {isAnalyzing ? 'Analyzing...' : 'Run/Refresh Analysis'}
            </button>
        )}
      </div>
      {analysisMessage && (
        <p style={{ 
            padding: '10px', 
            marginBottom: '15px', 
            borderRadius: 'var(--border-radius)', 
            backgroundColor: analysisMessage.toLowerCase().includes('error') ? '#ffe0e0' : '#e6ffed',
            border: `1px solid ${analysisMessage.toLowerCase().includes('error') ? 'red' : 'var(--success-green)'}`,
            color: analysisMessage.toLowerCase().includes('error') ? 'red' : 'var(--text-primary)',
        }}>
            {analysisMessage}
        </p>
      )}

      {/* Tab Buttons */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-tab ${activeView === 'standardAlignment' ? 'active' : ''}`}
          style={{marginRight:0}}
          onClick={() => setActiveView('standardAlignment')}
          disabled={!selectedCurriculum}
        >
          Standard Alignment
        </button>
        <button
          className={`btn btn-tab ${activeView === 'gapAnalysis' ? 'active' : ''}`}
          style={{marginRight:0}}
          onClick={() => setActiveView('gapAnalysis')}
          disabled={!selectedCurriculum}
        >
          Gap Analysis
        </button>
        {/* Resource Check button removed from here */}
        <button
          className={`btn btn-tab ${activeView === 'industryAlignment' ? 'active' : ''}`}
          onClick={() => setActiveView('industryAlignment')}
          disabled={!selectedCurriculum}
        >
          Regional Industry Alignment
        </button>
      </div>

      <div className="dashboard-view-content-area">
        {selectedCurriculum ? renderView() : <div style={emptyStateTextStyle}>No curriculum data to display the view. Select a curriculum.</div>}
      </div>
    </section>
  );
};

export default DataVisualizationDashboard;
