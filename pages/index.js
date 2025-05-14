// File: pages/index.js
import Head from 'next/head';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DataVisualizationDashboard from '../components/dashboard/DataVisualizationDashboard';
import AiChatInterface from '../components/chat/AiChatInterface';
import MainLayout from '../components/layout/MainLayout';
import prisma from '../lib/prisma'; // For getServerSideProps

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
        analysisStatus: true,             // Expecting this field
        analysisError: true,              // Expecting this field
        lastAnalysisTriggeredAt: true,    // Expecting this field
        lastAnalysisCompletedAt: true,    // Expecting this field
        // analysisResults: true, // Not fetching full results for sidebar list initially
      }
    });
    // Serialize Date objects
    curriculaList = curriculaList.map(c => ({
      ...c,
      uploadedAt: c.uploadedAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastAnalysisTriggeredAt: c.lastAnalysisTriggeredAt?.toISOString() || null,
      lastAnalysisCompletedAt: c.lastAnalysisCompletedAt?.toISOString() || null,
    }));
    console.log(`[GSSP] Successfully fetched ${curriculaList.length} curricula.`);
  } catch (error) {
    console.error("[GSSP] Failed to fetch curricula list:", error.message, error.stack);
    curriculaListError = "Unable to fetch curricula list. Prisma Error: " + error.message;
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
      if (!response.ok) throw new Error((await response.json().catch(()=>({error: "Unknown error fetching action items"}))).error || `Failed to fetch action items: ${response.status}`);
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
      if (!response.ok) throw new Error((await response.json().catch(()=>({error: "Unknown error fetching curriculum details"}))).error || `Failed to fetch details: ${response.status}`);
      const data = await response.json();
      setSelectedCurriculumDetails(data); // data includes analysisStatus, analysisError, analysisResults
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
        } else if (statusData.analysisStatus === "PROCESSING") {
            setAnalysisTriggerUIMessage("Analysis is still processing...");
        }
    } catch (error) {
        console.error(`[HomePage] Error during polling for ${curriculumId}:`, error);
        stopPolling(); setAnalysisTriggerUIMessage(`Error polling status: ${error.message}`);
    }
  }, [stopPolling]);

  const startPollingAnalysisStatus = useCallback((curriculumId) => {
    stopPolling(); console.log(`[HomePage] Starting polling for ${curriculumId}`);
    setAnalysisTriggerUIMessage("Analysis processing... status will update.");
    pollAnalysisStatus(curriculumId); 
    const intervalId = setInterval(() => pollAnalysisStatus(curriculumId), 7000); // Poll every 7 seconds
    pollingIntervalRef.current = intervalId;
  }, [pollAnalysisStatus, stopPolling]);

  useEffect(() => { return () => stopPolling(); }, [stopPolling]); // Cleanup polling on component unmount

  useEffect(() => {
    const currentSelectedStillInList = selectedCurriculumDetails && curriculaForSidebar.find(c => c.id === selectedCurriculumDetails.id);
    if (curriculaForSidebar.length > 0 && (!currentSelectedStillInList || !selectedCurriculumDetails) && !isLoadingDetails) {
      const firstCurriculumId = curriculaForSidebar[0].id;
      console.log("[HomePage] Initial load or list change: Fetching details for first curriculum:", firstCurriculumId);
      fetchFullCurriculumDetails(firstCurriculumId, true);
    } else if (selectedCurriculumDetails && selectedCurriculumDetails.analysisStatus === "PROCESSING" && !pollingIntervalRef.current) {
      console.log("[HomePage] Resuming polling for already selected processing curriculum:", selectedCurriculumDetails.id);
      startPollingAnalysisStatus(selectedCurriculumDetails.id);
    } else if (curriculaForSidebar.length === 0) {
        console.log("[HomePage] No curricula in sidebar, clearing details.");
        setSelectedCurriculumDetails(null); setActionItems([]); stopPolling();
    }
  }, [curriculaForSidebar, selectedCurriculumDetails, fetchFullCurriculumDetails, isLoadingDetails, startPollingAnalysisStatus, stopPolling]);

  const handleSelectCurriculum = useCallback((curriculumId) => {
    stopPolling(); setAnalysisTriggerUIMessage('');
    console.log(`[HomePage] handleSelectCurriculum called with ID: ${curriculumId}`);
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
        if (result.curriculum) setSelectedCurriculumDetails(result.curriculum);
        startPollingAnalysisStatus(curriculumId);
    } catch (error) {
        console.error(`[HomePage] Error triggering analysis for ${curriculumId}:`, error);
        alert(`Error triggering analysis: ${error.message}`);
        setAnalysisTriggerUIMessage(`Error: ${error.message}`);
        setSelectedCurriculumDetails(prev => prev && prev.id === curriculumId ? {...prev, analysisStatus: "FAILED", analysisError: error.message} : prev);
    }
  };

  const handleCreateNewCurriculum = async (formData) => {
    setIsCreatingCurriculum(true);
    try {
      const response = await fetch('/api/curricula', { method: 'POST', body: formData });
      if (!response.ok) throw new Error((await response.json().catch(()=>({error:"Unknown error creating curriculum"}))).error || "Failed to create curriculum");
      const createdCurriculum = await response.json();
      setCurriculaForSidebar(prev => [createdCurriculum, ...prev]); // Add new curriculum to the top of the list
      handleSelectCurriculum(createdCurriculum.id); // Select the newly created one
    } catch (error) {
      console.error("[HomePage] Error creating curriculum:", error);
      alert(`Error creating curriculum: ${error.message}`);
    } finally { setIsCreatingCurriculum(false); }
  };

  const handleDeleteCurriculum = async (curriculumIdToDelete) => {
    if (!confirm("Are you sure you want to delete this curriculum and all its associated data? This cannot be undone.")) return;
    setIsDeletingCurriculum(true);
    try {
        const response = await fetch(`/api/curricula/${curriculumIdToDelete}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 204) throw new Error((await response.json().catch(()=>({error:"Unknown error deleting curriculum"}))).error || `Failed to delete curriculum.`);
        
        const updatedSidebarList = curriculaForSidebar.filter(c => c.id !== curriculumIdToDelete);
        setCurriculaForSidebar(updatedSidebarList);

        if (selectedCurriculumDetails && selectedCurriculumDetails.id === curriculumIdToDelete) {
            if (updatedSidebarList.length > 0) {
                handleSelectCurriculum(updatedSidebarList[0].id);
            } else {
                setSelectedCurriculumDetails(null); 
                setActionItems([]);
                stopPolling(); // Stop polling if no curricula left
            }
        }
    } catch (error) {
      console.error("[HomePage] Error deleting curriculum:", error);
      alert(`Error deleting curriculum: ${error.message}`);
    } finally { setIsDeletingCurriculum(false); }
  };

  const handleCreateActionItem = async (actionItemData) => {
    if (!selectedCurriculumDetails?.id) { alert("Select curriculum first."); return; }
    try {
      const response = await fetch('/api/action-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...actionItemData, curriculumId: selectedCurriculumDetails.id }),
      });
      if (!response.ok) throw new Error((await response.json().catch(()=>({error:"Unknown error creating action item"}))).error || "Failed to create action item");
      const newActionItem = await response.json();
      setActionItems(prev => [...prev, newActionItem]); // Add to local state
    } catch (error) { console.error("[HomePage] Error creating action item:", error); alert(`Error: ${error.message}`); }
  };

  const handleUpdateActionItem = async (actionItemId, updates) => {
    const originalItems = [...actionItems];
    setActionItems(prev => prev.map(item => (item.id === actionItemId ? { ...item, ...updates } : item))); // Optimistic update
    try {
      const response = await fetch(`/api/action-items/${actionItemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error((await response.json().catch(()=>({error:"Unknown error updating action item"}))).error || "Failed to update action item");
      const updatedItemFromServer = await response.json();
      setActionItems(prev => prev.map(item => (item.id === actionItemId ? updatedItemFromServer : item))); // Sync with server
    } catch (error) { console.error(`Error updating action item ${actionItemId}:`, error); alert(`Error: ${error.message}`); setActionItems(originalItems); }
  };
  
  const handleDeleteActionItem = async (actionItemId) => {
    if (!confirm("Delete this action item?")) return;
    const originalItems = [...actionItems];
    setActionItems(prev => prev.filter(item => item.id !== actionItemId)); // Optimistic update
    try {
      const response = await fetch(`/api/action-items/${actionItemId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) throw new Error((await response.json().catch(()=>({error:"Unknown error deleting action item"}))).error || `Failed to delete action item.`);
    } catch (error) { console.error(`Error deleting action item ${actionItemId}:`, error); alert(`Error: ${error.message}`); setActionItems(originalItems); }
  };

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
        selectedCurriculum={selectedCurriculumDetails} // This now includes analysisStatus, analysisError, analysisResults
        isLoading={isLoadingDetails && (!selectedCurriculumDetails || (selectedCurriculumDetails.analysisStatus !== "PROCESSING" && selectedCurriculumDetails.analysisStatus !== "COMPLETED" && selectedCurriculumDetails.analysisStatus !== "FAILED"))}
        error={detailsError} // Error from fetching curriculum details itself
        onTriggerAnalysis={handleTriggerAnalysis}
        analysisTriggerMessage={analysisTriggerUIMessage} // Message like "Processing..." or "Completed!"
      />
      <AiChatInterface
        selectedCurriculum={selectedCurriculumDetails}
      />
    </MainLayout>
  );
}
