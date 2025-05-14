// File: pages/index.js
import Head from 'next/head';
import React, { useState, useEffect, useCallback } from 'react';
import DataVisualizationDashboard from '../components/dashboard/DataVisualizationDashboard';
import AiChatInterface from '../components/chat/AiChatInterface';
import MainLayout from '../components/layout/MainLayout';
import prisma from '../lib/prisma'; // For getServerSideProps

export async function getServerSideProps(context) {
  console.log("[GSSP] Fetching initial curricula list...");
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
        // For the sidebar list, we might not need full analysisResults initially.
        // If analysisStatus is important for the initial view, select it too.
        analysisStatus: true, 
      }
    });
    // Serialize Date objects
    curriculaList = curriculaList.map(c => ({
      ...c,
      uploadedAt: c.uploadedAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    console.log(`[GSSP] Successfully fetched ${curriculaList.length} curricula.`);
  } catch (error) {
    console.error("[GSSP] Failed to fetch curricula list:", error.message, error.stack);
    curriculaListError = "Unable to fetch curricula list from server. " + error.message;
  }
  return { props: { initialCurriculaList: curriculaList, initialCurriculaListError: curriculaListError } };
}

export default function HomePage({ initialCurriculaList, initialCurriculaListError }) {
  // Curriculum States
  const [curriculaForSidebar, setCurriculaForSidebar] = useState(initialCurriculaList || []);
  const [sidebarError, setSidebarError] = useState(initialCurriculaListError);
  const [isSidebarLoading, setIsSidebarLoading] = useState(!initialCurriculaList && !initialCurriculaListError);
  
  const [selectedCurriculumDetails, setSelectedCurriculumDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false); // For loading full details of selected curriculum
  const [detailsError, setDetailsError] = useState(null);
  
  const [isCreatingCurriculum, setIsCreatingCurriculum] = useState(false);
  const [isDeletingCurriculum, setIsDeletingCurriculum] = useState(false);

  // Action Item States
  const [actionItems, setActionItems] = useState([]);
  const [isLoadingActionItems, setIsLoadingActionItems] = useState(false);
  const [actionItemsError, setActionItemsError] = useState(null);

  // State for polling analysis status
  const [pollingIntervalId, setPollingIntervalId] = useState(null);
  const [currentAnalysisTriggerMessage, setCurrentAnalysisTriggerMessage] = useState('');


  // Fetch Action Items for a specific curriculum
  const fetchActionItemsForCurriculum = useCallback(async (curriculumId) => {
    if (!curriculumId) {
      setActionItems([]);
      return;
    }
    setIsLoadingActionItems(true);
    setActionItemsError(null);
    try {
      const response = await fetch(`/api/action-items?curriculumId=${curriculumId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Failed to parse error from action items API"}));
        throw new Error(errorData.error || `Failed to fetch action items: ${response.status}`);
      }
      const data = await response.json();
      setActionItems(data);
    } catch (error) {
      console.error(`[HomePage] Error fetching action items for curriculum ${curriculumId}:`, error);
      setActionItemsError(error.message);
      setActionItems([]);
    } finally {
      setIsLoadingActionItems(false);
    }
  }, []);

  // Fetch Full Curriculum Details (including analysisResults, status, etc.)
  const fetchFullCurriculumDetails = useCallback(async (curriculumId, isSelectionChange = false) => {
    if (!curriculumId) {
      setSelectedCurriculumDetails(null);
      setActionItems([]);
      if (pollingIntervalId) clearInterval(pollingIntervalId); // Clear polling if no curriculum
      setPollingIntervalId(null);
      return;
    }
    
    // Only show main loading spinner if it's a direct selection change
    // or if there are no details yet. Polling updates will be more subtle.
    if (isSelectionChange || !selectedCurriculumDetails) {
        setIsLoadingDetails(true);
    }
    setDetailsError(null);

    try {
      const response = await fetch(`/api/curricula/${curriculumId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Failed to parse error from curriculum details API"}));
        throw new Error(errorData.error || `Failed to fetch details: ${response.status}`);
      }
      const data = await response.json();
      setSelectedCurriculumDetails(data); // This now includes analysisStatus, analysisError etc.
      fetchActionItemsForCurriculum(curriculumId);

      // If analysis is processing, start or continue polling
      if (data.analysisStatus === "PROCESSING") {
        // eslint-disable-next-line no-use-before-define
        startPollingAnalysisStatus(curriculumId);
      } else {
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
      }

    } catch (error) {
      console.error(`[HomePage] Error fetching full details for curriculum ${curriculumId}:`, error);
      setDetailsError(error.message);
      setSelectedCurriculumDetails(null);
      setActionItems([]);
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    } finally {
      if (isSelectionChange || !selectedCurriculumDetails) { // Only stop main loader for direct selection
          setIsLoadingDetails(false);
      }
    }
  }, [fetchActionItemsForCurriculum, pollingIntervalId]); // Added pollingIntervalId to deps

  // Polling function
  const pollAnalysisStatus = useCallback(async (curriculumId) => {
    console.log(`[HomePage] Polling status for ${curriculumId}`);
    try {
        const response = await fetch(`/api/curricula/${curriculumId}/analysis-status`);
        if (!response.ok) {
            // Don't throw, just log and let polling continue or stop based on status
            console.error(`[HomePage] Polling error: ${response.status}`);
            // Potentially stop polling on certain errors if needed
            return; 
        }
        const statusData = await response.json();
        setSelectedCurriculumDetails(prevDetails => ({ // Update details with latest status/results
            ...prevDetails,
            ...statusData, // This will update analysisStatus, analysisError, analysisResults
        }));

        if (statusData.analysisStatus === "COMPLETED" || statusData.analysisStatus === "FAILED") {
            console.log(`[HomePage] Polling complete for ${curriculumId}, status: ${statusData.analysisStatus}`);
            if (pollingIntervalId) clearInterval(pollingIntervalId);
            setPollingIntervalId(null);
            setCurrentAnalysisTriggerMessage(''); // Clear processing message
        }
    } catch (error) {
        console.error(`[HomePage] Error during polling for ${curriculumId}:`, error);
        // Potentially stop polling on network errors
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setPollingIntervalId(null);
    }
  }, [pollingIntervalId]); // Added pollingIntervalId

  const startPollingAnalysisStatus = useCallback((curriculumId) => {
    if (pollingIntervalId) clearInterval(pollingIntervalId); // Clear existing interval if any
    
    // Poll immediately once, then set interval
    pollAnalysisStatus(curriculumId); 
    
    const intervalId = setInterval(() => {
      pollAnalysisStatus(curriculumId);
    }, 5000); // Poll every 5 seconds
    setPollingIntervalId(intervalId);
  }, [pollAnalysisStatus]); // pollAnalysisStatus is now a dependency

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId);
    };
  }, [pollingIntervalId]);


  // Initial load effect
  useEffect(() => {
    if (curriculaForSidebar.length > 0 && !selectedCurriculumDetails && !isLoadingDetails) {
      fetchFullCurriculumDetails(curriculaForSidebar[0].id, true); // true for isSelectionChange
    } else if (curriculaForSidebar.length === 0) {
        setSelectedCurriculumDetails(null);
        setActionItems([]);
    }
  }, [curriculaForSidebar, selectedCurriculumDetails, fetchFullCurriculumDetails, isLoadingDetails]);

  // Handler for selecting a curriculum in the sidebar
  const handleSelectCurriculum = useCallback((curriculumId) => {
    if (pollingIntervalId) clearInterval(pollingIntervalId); // Stop polling for old curriculum
    setPollingIntervalId(null);
    setCurrentAnalysisTriggerMessage(''); // Clear any "processing" message

    if (!selectedCurriculumDetails || selectedCurriculumDetails.id !== curriculumId) {
      fetchFullCurriculumDetails(curriculumId, true); // true for isSelectionChange
    }
  }, [selectedCurriculumDetails, fetchFullCurriculumDetails, pollingIntervalId]);

  // Handler for triggering analysis (this is the new "Run/Refresh Analysis")
  const handleTriggerAnalysis = async (curriculumId) => {
    if (!curriculumId) {
        alert("No curriculum selected to analyze.");
        return;
    }
    console.log(`[HomePage] Triggering analysis for curriculum ID: ${curriculumId}`);
    setCurrentAnalysisTriggerMessage("Analysis initiated..."); // Set initial message
    setIsLoadingDetails(true); // Show a general loading state for the dashboard
    try {
        const response = await fetch(`/api/curricula/${curriculumId}/trigger-analysis`, {
            method: 'POST',
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Failed to trigger analysis: ${response.status}`);
        }
        // Update selectedCurriculumDetails with the "PROCESSING" status from the trigger response
        setSelectedCurriculumDetails(result.curriculum);
        setCurrentAnalysisTriggerMessage(result.message || "Analysis processing...");
        startPollingAnalysisStatus(curriculumId); // Start polling for completion
    } catch (error) {
        console.error(`[HomePage] Error triggering analysis for ${curriculumId}:`, error);
        alert(`Error triggering analysis: ${error.message}`);
        setCurrentAnalysisTriggerMessage(`Error: ${error.message}`);
    } finally {
        // setIsLoadingDetails(false); // Polling will handle the final state update
    }
  };


  // Handler for creating a new curriculum (expects FormData)
  const handleCreateNewCurriculum = async (formData) => {
    setIsCreatingCurriculum(true);
    try {
      const response = await fetch('/api/curricula', {
        method: 'POST',
        body: formData, 
      });
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({error: `API error ${response.status}`}));
        throw new Error(errorResult.error || "Failed to create curriculum");
      }
      const createdCurriculum = await response.json();
      setCurriculaForSidebar(prev => [createdCurriculum, ...prev]);
      handleSelectCurriculum(createdCurriculum.id); 
    } catch (error) {
      console.error("[HomePage] Error creating curriculum:", error);
      alert(`Error creating curriculum: ${error.message}`);
    } finally {
      setIsCreatingCurriculum(false);
    }
  };

  // Handler for deleting a curriculum
  const handleDeleteCurriculum = async (curriculumIdToDelete) => {
    if (!confirm("Are you sure you want to delete this curriculum and all its associated data? This cannot be undone.")) {
        return;
    }
    setIsDeletingCurriculum(true);
    try {
        const response = await fetch(`/api/curricula/${curriculumIdToDelete}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 204) {
            const errorData = await response.json().catch(() => ({error: `API error ${response.status}`}));
            throw new Error(errorData.error || `Failed to delete curriculum.`);
        }
        const updatedSidebarList = curriculaForSidebar.filter(c => c.id !== curriculumIdToDelete);
        setCurriculaForSidebar(updatedSidebarList);
        if (selectedCurriculumDetails && selectedCurriculumDetails.id === curriculumIdToDelete) {
            if (updatedSidebarList.length > 0) {
                handleSelectCurriculum(updatedSidebarList[0].id);
            } else {
                setSelectedCurriculumDetails(null); setActionItems([]);
            }
        }
        // alert("Curriculum deleted successfully.");
    } catch (error) {
      console.error("[HomePage] Error deleting curriculum:", error);
      alert(`Error deleting curriculum: ${error.message}`);
    } finally {
      setIsDeletingCurriculum(false);
    }
  };

  // Action Item Handlers
  const handleCreateActionItem = async (actionItemData) => { /* ... same as before ... */ };
  const handleUpdateActionItem = async (actionItemId, updates) => { /* ... same as before ... */ };
  const handleDeleteActionItem = async (actionItemId) => { /* ... same as before ... */ };

  let pageTitle = "Curriculum Dashboard - Platform";
  if (selectedCurriculumDetails?.name) { // Added optional chaining
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
        selectedCurriculum={selectedCurriculumDetails} // This now includes analysisStatus, analysisError
        isLoading={isLoadingDetails} // For initial detail load or when trigger makes it true
        error={detailsError}
        onTriggerAnalysis={handleTriggerAnalysis} // New prop to trigger analysis
        analysisTriggerMessage={currentAnalysisTriggerMessage} // To display "Processing..."
      />
      <AiChatInterface
        selectedCurriculum={selectedCurriculumDetails}
      />
    </MainLayout>
  );
}
