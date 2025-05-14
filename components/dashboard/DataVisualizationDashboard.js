// File: components/dashboard/DataVisualizationDashboard.js
import React, { useState, useEffect, useRef } from 'react';
import StandardAlignmentView from './StandardAlignmentView';
import GapAnalysisView from './GapAnalysisView';
import IndustryAlignmentView from './IndustryAlignmentView';

const dashboardStyle = { backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--border-radius)', boxShadow: 'var(--card-shadow)', marginBottom: '32px' };
const loadingTextStyle = { padding: '20px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '16px', fontStyle: 'italic' };
const errorTextStyle = { padding: '20px', color: 'red', textAlign: 'center', border: '1px solid red', borderRadius: 'var(--border-radius)', backgroundColor: '#ffe0e0', fontSize: '16px' };
const emptyStateTextStyle = { padding: '20px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '16px', fontStyle: 'italic', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: '#f9f9f9' };
const processingMessageStyle = {
  padding: '10px', 
  marginBottom: '15px', 
  borderRadius: 'var(--border-radius)', 
  backgroundColor: '#e6f7ff',
  border: '1px solid var(--primary-color)',
  color: 'var(--primary-color)',
  textAlign: 'center',
  fontStyle: 'italic',
};
const successMessageStyle = {
  padding: '10px', 
  marginBottom: '15px', 
  borderRadius: 'var(--border-radius)', 
  backgroundColor: '#e6ffed',
  border: '1px solid var(--success-green)',
  color: 'var(--success-green)',
  textAlign: 'center',
};

const DataVisualizationDashboard = ({ 
    selectedCurriculum, 
    isLoading, 
    error, 
    onTriggerAnalysis,
    analysisUIMessage 
}) => {
  const [activeView, setActiveView] = useState('standardAlignment');
  const [timeSinceTriggered, setTimeSinceTriggered] = useState(0);
  const processingTimerRef = useRef(null);

  const curriculumName = selectedCurriculum ? selectedCurriculum.name : "No curriculum selected";
  const analysisStatus = selectedCurriculum?.analysisStatus;
  const analysisError = selectedCurriculum?.analysisError;
  const analysisResults = selectedCurriculum?.analysisResults || {};
  const lastTriggered = selectedCurriculum?.lastAnalysisTriggeredAt;

  useEffect(() => {
    if (selectedCurriculum && (!activeView || activeView === 'resourceCheck')) {
      setActiveView('standardAlignment');
    }

    if (analysisStatus === "PROCESSING" && lastTriggered) {
      setTimeSinceTriggered(0); // Reset timer
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
      processingTimerRef.current = setInterval(() => {
        const triggeredTime = new Date(lastTriggered).getTime();
        const now = new Date().getTime();
        const secondsPassed = Math.round((now - triggeredTime) / 1000);
        setTimeSinceTriggered(secondsPassed);
      }, 1000);
    } else {
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
      setTimeSinceTriggered(0);
    }

    return () => { // Cleanup timer on unmount or when status changes from PROCESSING
      if (processingTimerRef.current) clearInterval(processingTimerRef.current);
    };
  }, [selectedCurriculum, analysisStatus, lastTriggered, activeView]);


  const handleRunAnalysisClick = () => {
    if (selectedCurriculum && onTriggerAnalysis) {
      setTimeSinceTriggered(0); // Reset timer on new trigger
      onTriggerAnalysis(selectedCurriculum.id);
    }
  };

  if (isLoading && !analysisStatus) {
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
        <p style={errorTextStyle}>Error loading curriculum details: {error}</p>
      </section>
    );
  }
  
  if (!selectedCurriculum && !isLoading) {
     return (
      <section style={dashboardStyle} aria-labelledby="dashboard-title-empty">
        <div>
          <h1 id="dashboard-title-empty" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '24px' }}>Please select a curriculum from the sidebar.</p>
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
    if (analysisStatus === "PROCESSING" || analysisStatus === "PENDING") {
      let processingMsg = "Analysis is currently processing...";
      if (timeSinceTriggered > 0) {
        processingMsg += ` (Elapsed: ${timeSinceTriggered}s)`;
      }
      if (timeSinceTriggered > 75) { // Slightly less than 90s Vercel timeout
        processingMsg += " This is taking longer than usual. The process might have timed out on the server. Please check back or try re-running if it doesn't complete soon.";
      }
      return <p style={loadingTextStyle}>{processingMsg}</p>;
    }
    if (analysisStatus === "FAILED") {
      return <p style={errorTextStyle}>Analysis Failed: {analysisError || "An unknown error occurred during analysis."}</p>;
    }
    if (analysisStatus === "COMPLETED") {
      if (analysisResults.error) {
        return <p style={errorTextStyle}>Analysis completed with an error: {analysisResults.error}</p>;
      }
      if (!analysisResults.analysisComplete && !analysisResults.error) {
         return <p style={loadingTextStyle}>Analysis results are not yet fully processed or are incomplete.</p>;
      }
      switch (activeView) {
        case 'standardAlignment':
          return <StandardAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} />;
        case 'gapAnalysis':
          return <GapAnalysisView analysisResults={analysisResults} curriculumName={curriculumName} />;
        case 'industryAlignment':
          return <IndustryAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} region={analysisResults?.regionalIndustryAlignment?.region || selectedCurriculum?.region || "Central Oklahoma"} />;
        default:
          return <StandardAlignmentView analysisResults={analysisResults} curriculumName={curriculumName} />;
      }
    }
    return <p style={emptyStateTextStyle}>Analysis results will appear here. Click "Run/Refresh Analysis" to start.</p>;
  };

  return (
    <section style={dashboardStyle} aria-labelledby="dashboard-title">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px'}}>
        <div>
            <h1 id="dashboard-title" style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-headings)' }}>Curriculum Analysis Dashboard</h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '10px' }}>
                Analyzing: <strong style={{color: 'var(--text-primary)'}}>{curriculumName}</strong>
            </p>
            {lastTriggered && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                    Last analysis triggered: {new Date(lastTriggered).toLocaleString()}
                    {selectedCurriculum?.lastAnalysisCompletedAt && ` | Completed: ${new Date(selectedCurriculum.lastAnalysisCompletedAt).toLocaleString()}`}
                </p>
            )}
        </div>
        {selectedCurriculum && (
            <button 
                className="btn btn-secondary" 
                onClick={handleRunAnalysisClick}
                disabled={analysisStatus === "PROCESSING"}
                style={{marginBottom: '20px', minWidth: '180px'}}
            >
                {analysisStatus === "PROCESSING" ? 'Analysis In Progress...' : 
                 (analysisStatus === "COMPLETED" || analysisStatus === "FAILED" || !analysisStatus || analysisStatus === "NOT_STARTED" ? "Run/Refresh Analysis" : "Run Analysis")}
            </button>
        )}
      </div>

      {analysisUIMessage && (analysisStatus === "PROCESSING" || analysisStatus === "PENDING") && (
        <p style={processingMessageStyle}>{analysisUIMessage}</p>
      )}
      {analysisStatus === "COMPLETED" && analysisUIMessage && analysisUIMessage.toLowerCase().includes("complete") && (
        <p style={successMessageStyle}>{analysisUIMessage}</p>
      )}
       {analysisStatus === "FAILED" && analysisUIMessage && analysisUIMessage.toLowerCase().includes("failed") && (
        <p style={errorTextStyle}>{analysisUIMessage}</p>
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

export default DataVisualizationDashboard;
