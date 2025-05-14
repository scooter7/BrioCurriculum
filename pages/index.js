// File: pages/index.js
import Head from 'next/head';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataVisualizationDashboard from '../components/dashboard/DataVisualizationDashboard';
import AiChatInterface from '../components/chat/AiChatInterface';
import MainLayout from '../components/layout/MainLayout';
import prisma from '../lib/prisma';

export async function getServerSideProps(context) {
  console.log("[GSSP] Attempting to fetch initial curricula list...");
  let curriculaList = [];
  let curriculaListError = null;
  try {
    curriculaList = await prisma.curriculum.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: { 
        id: true, 
        name: true, 
        schoolTag: true, 
        uploadedAt: true, 
        updatedAt: true,
        analysisStatus: true,             // Added field
        analysisError: true,              // Added field
        lastAnalysisTriggeredAt: true,    // Added field
        lastAnalysisCompletedAt: true,    // Added field
        // analysisResults: true, // Optionally fetch full results here, or just status
      }
    });
    curriculaList = curriculaList.map(c => ({
      ...c,
      uploadedAt: c.uploadedAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastAnalysisTriggeredAt: c.lastAnalysisTriggeredAt?.toISOString() || null,
      lastAnalysisCompletedAt: c.lastAnalysisCompletedAt?.toISOString() || null,
      // analysisResults: c.analysisResults || {}, // If fetching full results
    }));
    console.log(`[GSSP] Successfully fetched ${curriculaList.length} curricula.`);
  } catch (error) {
    console.error("[GSSP] Failed to fetch curricula list:", error.message, error.stack);
    curriculaListError = "Unable to fetch curricula list. " + error.message;
  }
  return { props: { initialCurriculaList: curriculaList, initialCurriculaListError: curriculaListError } };
}

export default function HomePage({ initialCurriculaList, initialCurriculaListError }) {
  const [curriculaForSidebar, setCurriculaForSidebar] = useState(initialCurriculaList || []);
  const [sidebarError, setSidebarError] = useState(initialCurriculaListError);
  const [isSidebarLoading, setIsSidebarLoading] = useState(!initialCurriculaList && !initialCurriculaListError);
  
  const [selectedCurriculumDetails, setSelectedCurriculumDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  
  const [isCreatingCurriculum, setIsCreatingCurriculum] = useState(false);
  const [isDeletingCurriculum, setIsDeletingCurriculum] = useState(false);

  const [actionItems, setActionItems] = useState([]);
  const [isLoadingActionItems, setIsLoadingActionItems] = useState(false);
  const [actionItemsError, setActionItemsError] = useState(null);

  const pollingIntervalRef = useRef(null);
  const [analysisTriggerUIMessage, setAnalysisTriggerUIMessage] = useState('');

  const fetchActionItemsForCurriculum = useCallback(async (curriculumId) => {
    if (!curriculumId) { setActionItems([]); return; }
    setIsLoadingActionItems(true); setActionItemsError(null);
    try {
      const response = await fetch(`/api/action-items?curriculumId=${curriculumId}`);
      if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || `Failed to fetch action items: ${response.status}`);
      setActionItems(await response.json());
    } catch (error) {
      console.error(`[HomePage] Error fetching action items for ${curriculumId}:`, error);
      setActionItemsError(error.message); setActionItems([]);
    } finally { setIsLoadingActionItems(false); }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log("[HomePage] Polling stopped.");
    }
  }, []);

  const fetchFullCurriculumDetails = useCallback(async (curriculumId, isSelectionChange = false) => {
    if (!curriculumId) {
      setSelectedCurriculumDetails(null); setActionItems([]); stopPolling(); return;
    }
    if (isSelectionChange || !selectedCurriculumDetails || selectedCurriculumDetails.id !== curriculumId) {
        setIsLoadingDetails(true);
    }
    setDetailsError(null); setAnalysisTriggerUIMessage('');
    try {
      const response = await fetch(`/api/curricula/${curriculumId}`);
      if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || `Failed to fetch details: ${response.status}`);
      const data = await response.json();
      setSelectedCurriculumDetails(data);
      fetchActionItemsForCurriculum(curriculumId);
      if (data.analysisStatus === "PROCESSING") {
        // eslint-disable-next-line no-use-before-define
        startPollingAnalysisStatus(curriculumId);
      } else { stopPolling(); }
    } catch (error) {
      console.error(`[HomePage] Error fetching full details for ${curriculumId}:`, error);
      setDetailsError(error.message); setSelectedCurriculumDetails(null); setActionItems([]); stopPolling();
    } finally {
      if (isSelectionChange || !selectedCurriculumDetails || selectedCurriculumDetails.id !== curriculumId) {
          setIsLoadingDetails(false);
      }
    }
  }, [fetchActionItemsForCurriculum, stopPolling]);

  const pollAnalysisStatus = useCallback(async (curriculumId) => {
    console.log(`[HomePage] Polling status for ${curriculumId}`);
    try {
        const response = await fetch(`/api/curricula/${curriculumId}/analysis-status`);
        if (!response.ok) { console.error(`[HomePage] Polling error: ${response.status}`); return; }
        const statusData = await response.json();
        console.log("[HomePage] Polling received status data:", statusData);
        setSelectedCurriculumDetails(prevDetails => 
            (prevDetails && prevDetails.id === curriculumId) ? { ...prevDetails, ...statusData } : prevDetails
        );
        if (statusData.analysisStatus === "COMPLETED" || statusData.analysisStatus === "FAILED") {
            console.log(`[HomePage] Polling complete for ${curriculumId}, status: ${statusData.analysisStatus}`);
            stopPolling();
            setAnalysisTriggerUIMessage(statusData.analysisStatus === "COMPLETED" ? 'Analysis complete!' : `Analysis failed: ${statusData.analysisError || 'Unknown error'}`);
            fetchFullCurriculumDetails(curriculumId, false);
        } else if (statusData.analysisStatus === "PROCESSING") {
            setAnalysisTriggerUIMessage("Analysis is still processing...");
        }
    } catch (error) {
        console.error(`[HomePage] Error during polling for ${curriculumId}:`, error);
        stopPolling(); setAnalysisTriggerUIMessage(`Error polling status: ${error.message}`);
    }
  }, [stopPolling, fetchFullCurriculumDetails]);

  const startPollingAnalysisStatus = useCallback((curriculumId) => {
    stopPolling(); console.log(`[HomePage] Starting polling for ${curriculumId}`);
    setAnalysisTriggerUIMessage("Analysis processing... status will update.");
    pollAnalysisStatus(curriculumId); 
    const intervalId = setInterval(() => pollAnalysisStatus(curriculumId), 7000);
    pollingIntervalRef.current = intervalId;
  }, [pollAnalysisStatus, stopPolling]);

  useEffect(() => { return () => stopPolling(); }, [stopPolling]);

  useEffect(() => {
    const currentSelectedIdInList = selectedCurriculumDetails && curriculaForSidebar.find(c => c.id === selectedCurriculumDetails.id);
    if (curriculaForSidebar.length > 0 && (!currentSelectedIdInList || !selectedCurriculumDetails) && !isLoadingDetails) {
      const firstCurriculumId = curriculaForSidebar[0].id;
      fetchFullCurriculumDetails(firstCurriculumId, true);
    } else if (selectedCurriculumDetails && selectedCurriculumDetails.analysisStatus === "PROCESSING" && !pollingIntervalRef.current) {
      startPollingAnalysisStatus(selectedCurriculumDetails.id);
    } else if (curriculaForSidebar.length === 0) {
        setSelectedCurriculumDetails(null); setActionItems([]); stopPolling();
    }
  }, [curriculaForSidebar, selectedCurriculumDetails, fetchFullCurriculumDetails, isLoadingDetails, startPollingAnalysisStatus, stopPolling]);

  const handleSelectCurriculum = useCallback((curriculumId) => {
    stopPolling(); setAnalysisTriggerUIMessage('');
    fetchFullCurriculumDetails(curriculumId, true);
  }, [fetchFullCurriculumDetails, stopPolling]);

  const handleTriggerAnalysis = async (curriculumId) => {
    if (!curriculumId) { alert("No curriculum selected to analyze."); return; }
    console.log(`[HomePage] Triggering analysis for curriculum ID: ${curriculumId}`);
    setAnalysisTriggerUIMessage("Initiating analysis...");
    setSelectedCurriculumDetails(prev => prev && prev.id === curriculumId ? {...prev, analysisStatus: "PROCESSING", analysisError: null, analysisResults: {}} : prev);
    try {
        const response = await fetch(`/api/curricula/${curriculumId}/trigger-analysis`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Failed to trigger analysis: ${response.status}`);
        console.log("[HomePage] Analysis triggered successfully:", result.message);
        if (result.curriculum) setSelectedCurriculumDetails(result.curriculum); // Update with initial "PROCESSING" state
        startPollingAnalysisStatus(curriculumId);
    } catch (error) {
        console.error(`[HomePage] Error triggering analysis for ${curriculumId}:`, error);
        alert(`Error triggering analysis: ${error.message}`);
        setAnalysisTriggerUIMessage(`Error: ${error.message}`);
        setSelectedCurriculumDetails(prev => prev && prev.id === curriculumId ? {...prev, analysisStatus: "FAILED", analysisError: error.message} : prev);
    }
  };

  const handleCreateNewCurriculum = async (formData) => { /* ... same as before ... */ };
  const handleDeleteCurriculum = async (curriculumIdToDelete) => { /* ... same as before ... */ };
  const handleCreateActionItem = async (actionItemData) => { /* ... same as before ... */ };
  const handleUpdateActionItem = async (actionItemId, updates) => { /* ... same as before ... */ };
  const handleDeleteActionItem = async (actionItemId) => { /* ... same as before ... */ };

  let pageTitle = "Curriculum Dashboard - Platform";
  if (selectedCurriculumDetails?.name) {
    pageTitle = `${selectedCurriculumDetails.name} - Analysis - Platform`;
  }

  return (
    <MainLayout
      curricula={curriculaForSidebar}
      selectedCurriculumId={selectedCurriculumDetails?.id}
      onSelectCurriculum={handleSelectCurriculum}
      isLoadingCurricula={isSidebarLoading}
      curriculaError={sidebarError}
      onCreateNewCurriculum={handleCreateNewCurriculum}
      isCreatingCurriculum={isCreatingCurriculum}
      onDeleteCurriculum={handleDeleteCurriculum}
      isDeletingCurriculum={isDeletingCurriculum}
      actionItems={actionItems}
      isLoadingActionItems={isLoadingActionItems}
      actionItemsError={actionItemsError}
      onCreateActionItem={handleCreateActionItem}
      onUpdateActionItem={handleUpdateActionItem}
      onDeleteActionItem={handleDeleteActionItem}
    >
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Analyze curriculum alignment with standards and regional industry needs." />
      </Head>
      <DataVisualizationDashboard
        selectedCurriculum={selectedCurriculumDetails}
        isLoading={isLoadingDetails && (!selectedCurriculumDetails || selectedCurriculumDetails.analysisStatus !== "PROCESSING")}
        error={detailsError}
        onTriggerAnalysis={handleTriggerAnalysis}
        analysisTriggerMessage={analysisTriggerUIMessage}
      />
      <AiChatInterface
        selectedCurriculum={selectedCurriculumDetails}
      />
    </MainLayout>
  );
}
