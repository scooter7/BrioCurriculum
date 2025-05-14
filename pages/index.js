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
        // analysisResults is Json type in schema for PG, Prisma client handles it as object
        // No need to select it here if we fetch full details on client,
        // but if selected, it's already an object or null.
        // For the sidebar list, we might not need full analysisResults.
      }
    });
    // Serialize Date objects
    curriculaList = curriculaList.map(c => ({
      ...c,
      uploadedAt: c.uploadedAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      // analysisResults: c.analysisResults || {}, // Ensure it's an object if selected
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
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [isCreatingCurriculum, setIsCreatingCurriculum] = useState(false);
  const [isDeletingCurriculum, setIsDeletingCurriculum] = useState(false);

  // Action Item States
  const [actionItems, setActionItems] = useState([]);
  const [isLoadingActionItems, setIsLoadingActionItems] = useState(false);
  const [actionItemsError, setActionItemsError] = useState(null);

  // Fetch Action Items for a specific curriculum
  const fetchActionItemsForCurriculum = useCallback(async (curriculumId) => {
    if (!curriculumId) {
      console.log("[HomePage] fetchActionItemsForCurriculum called with no curriculumId, clearing action items.");
      setActionItems([]);
      return;
    }
    console.log(`[HomePage] fetchActionItemsForCurriculum for ID: ${curriculumId}`);
    setIsLoadingActionItems(true);
    setActionItemsError(null);
    try {
      const response = await fetch(`/api/action-items?curriculumId=${curriculumId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Failed to parse error from action items API"}));
        throw new Error(errorData.error || `Failed to fetch action items: ${response.status}`);
      }
      const data = await response.json();
      console.log("[HomePage] Fetched action items:", data);
      setActionItems(data);
    } catch (error) {
      console.error(`[HomePage] Error fetching action items for curriculum ${curriculumId}:`, error);
      setActionItemsError(error.message);
      setActionItems([]);
    } finally {
      setIsLoadingActionItems(false);
    }
  }, []);

  // Fetch Curriculum Details (and subsequently action items)
  const fetchCurriculumDetails = useCallback(async (curriculumId) => {
    if (!curriculumId) {
      console.log("[HomePage] fetchCurriculumDetails called with no ID, clearing details.");
      setSelectedCurriculumDetails(null);
      setActionItems([]); // Clear action items if no curriculum is selected
      return;
    }
    console.log(`[HomePage] fetchCurriculumDetails called for ID: ${curriculumId}`);
    setIsLoadingDetails(true);
    setDetailsError(null);
    try {
      const response = await fetch(`/api/curricula/${curriculumId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Failed to parse error from curriculum details API"}));
        throw new Error(errorData.error || `Failed to fetch details: ${response.status}`);
      }
      const data = await response.json();
      setSelectedCurriculumDetails(data);
      fetchActionItemsForCurriculum(curriculumId); // Fetch action items after curriculum details are loaded
    } catch (error) {
      console.error(`[HomePage] Error fetching details for curriculum ${curriculumId}:`, error);
      setDetailsError(error.message);
      setSelectedCurriculumDetails(null);
      setActionItems([]);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [fetchActionItemsForCurriculum]); // Added fetchActionItemsForCurriculum to dependency array

  // Initial load effect
  useEffect(() => {
    console.log("[HomePage] Initial load useEffect. curriculaForSidebar length:", curriculaForSidebar.length, "selectedCurriculumDetails:", !!selectedCurriculumDetails, "isLoadingDetails:", isLoadingDetails);
    if (curriculaForSidebar.length > 0 && !selectedCurriculumDetails && !isLoadingDetails) {
      console.log("[HomePage] Initial load: Fetching details for first curriculum:", curriculaForSidebar[0].id);
      fetchCurriculumDetails(curriculaForSidebar[0].id);
    } else if (curriculaForSidebar.length === 0) {
        console.log("[HomePage] Initial load: No curricula, clearing details.");
        setSelectedCurriculumDetails(null);
        setActionItems([]);
    }
  }, [curriculaForSidebar, selectedCurriculumDetails, fetchCurriculumDetails, isLoadingDetails]);

  // Handler for selecting a curriculum in the sidebar
  const handleSelectCurriculum = useCallback((curriculumId) => {
    console.log(`[HomePage] handleSelectCurriculum called with ID: ${curriculumId}`);
    if (!selectedCurriculumDetails || selectedCurriculumDetails.id !== curriculumId) {
      fetchCurriculumDetails(curriculumId);
    } else {
      console.log("[HomePage] Curriculum already selected, not re-fetching details.");
    }
  }, [selectedCurriculumDetails, fetchCurriculumDetails]);

  // Handler for when analysis is complete
  const handleAnalysisCompletion = (updatedCurriculumWithAnalysis) => {
    console.log("[HomePage] handleAnalysisCompletion called with:", updatedCurriculumWithAnalysis);
    setSelectedCurriculumDetails(updatedCurriculumWithAnalysis); // Update the detailed view
    // Update the summary in the sidebar list
    setCurriculaForSidebar(prevList =>
      prevList.map(c =>
        c.id === updatedCurriculumWithAnalysis.id
          ? { ...c, 
              name: updatedCurriculumWithAnalysis.name, 
              schoolTag: updatedCurriculumWithAnalysis.schoolTag,
              updatedAt: updatedCurriculumWithAnalysis.updatedAt // Keep basic info updated
            }
          : c
      )
    );
  };

  // Handler for creating a new curriculum (expects FormData)
  const handleCreateNewCurriculum = async (formData) => {
    console.log("[HomePage] handleCreateNewCurriculum called.");
    // Logging FormData content is tricky directly, but UploadCurriculumForm logs it before calling this.
    setIsCreatingCurriculum(true);
    try {
      const response = await fetch('/api/curricula', {
        method: 'POST',
        // When sending FormData, DO NOT set 'Content-Type' header manually.
        // The browser will set it correctly to 'multipart/form-data' with the boundary.
        body: formData, 
      });
      console.log("[HomePage] Create curriculum API response status:", response.status);
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({error: `API error ${response.status}: ${response.statusText}`}));
        console.error("[HomePage] Create curriculum API error:", errorResult);
        throw new Error(errorResult.error || "Failed to create curriculum");
      }
      const createdCurriculum = await response.json();
      console.log("[HomePage] Successfully created curriculum:", createdCurriculum);
      setCurriculaForSidebar(prev => [createdCurriculum, ...prev]);
      handleSelectCurriculum(createdCurriculum.id); // Select and fetch details for the new one
      // alert("New curriculum created successfully!"); // Consider a less intrusive notification
    } catch (error) {
      console.error("[HomePage] Error in handleCreateNewCurriculum catch block:", error);
      alert(`Error creating curriculum: ${error.message}`);
    } finally {
      setIsCreatingCurriculum(false);
    }
  };

  // Handler for deleting a curriculum
  const handleDeleteCurriculum = async (curriculumIdToDelete) => {
    console.log(`[HomePage] handleDeleteCurriculum called for ID: ${curriculumIdToDelete}`);
    if (!confirm("Are you sure you want to delete this curriculum and all its associated data (like action items)? This cannot be undone.")) {
        return;
    }
    setIsDeletingCurriculum(true);
    try {
        const response = await fetch(`/api/curricula/${curriculumIdToDelete}`, {
            method: 'DELETE',
        });
        console.log("[HomePage] Delete curriculum API response status:", response.status);
        if (!response.ok && response.status !== 204) { // 204 is success with no content
            const errorData = await response.json().catch(() => ({error: `API error ${response.status}: ${response.statusText}`}));
            console.error("[HomePage] Delete curriculum API error:", errorData);
            throw new Error(errorData.error || `Failed to delete curriculum. Status: ${response.status}`);
        }
        
        const updatedSidebarList = curriculaForSidebar.filter(c => c.id !== curriculumIdToDelete);
        setCurriculaForSidebar(updatedSidebarList);

        if (selectedCurriculumDetails && selectedCurriculumDetails.id === curriculumIdToDelete) {
            if (updatedSidebarList.length > 0) {
                handleSelectCurriculum(updatedSidebarList[0].id);
            } else {
                setSelectedCurriculumDetails(null);
                setActionItems([]);
            }
        }
        alert("Curriculum deleted successfully.");
    } catch (error) {
        console.error("[HomePage] Error deleting curriculum:", error);
        alert(`Error deleting curriculum: ${error.message}`);
    } finally {
        setIsDeletingCurriculum(false);
    }
  };

  // Handler for creating a new action item
  const handleCreateActionItem = async (actionItemData) => {
    console.log("[HomePage] handleCreateActionItem called with data:", actionItemData);
    if (!selectedCurriculumDetails?.id) {
      alert("Please select a curriculum first to add an action item.");
      console.error("[HomePage] No selected curriculum to associate action item.");
      return;
    }
    console.log("[HomePage] Attempting to create action item for curriculum ID:", selectedCurriculumDetails.id);
    try {
      const response = await fetch('/api/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...actionItemData, // title, status, startDate, endDate
          curriculumId: selectedCurriculumDetails.id,
        }),
      });
      console.log("[HomePage] Create action item API response status:", response.status);
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({ error: `API error ${response.status}: ${response.statusText}` }));
        console.error("[HomePage] Create action item API error:", errorResult);
        throw new Error(errorResult.error || "Failed to create action item");
      }
      const newActionItem = await response.json();
      console.log("[HomePage] Successfully created action item:", newActionItem);
      setActionItems(prev => [...prev, newActionItem]);
    } catch (error) {
      console.error("[HomePage] Error in handleCreateActionItem catch block:", error);
      alert(`Error creating action item: ${error.message}`);
    }
  };

  // Handler for updating an action item
  const handleUpdateActionItem = async (actionItemId, updates) => {
    console.log(`[HomePage] handleUpdateActionItem called for ID: ${actionItemId} with updates:`, updates);
    const originalActionItems = [...actionItems];
    // Optimistic UI update
    setActionItems(prev =>
      prev.map(item => (item.id === actionItemId ? { ...item, ...updates } : item))
    );
    try {
      const response = await fetch(`/api/action-items/${actionItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      console.log(`[HomePage] Update action item API response status for ID ${actionItemId}:`, response.status);
      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({ error: `API error ${response.status}: ${response.statusText}` }));
        console.error(`[HomePage] Update action item API error for ID ${actionItemId}:`, errorResult);
        throw new Error(errorResult.error || "Failed to update action item");
      }
      const updatedItem = await response.json();
      console.log(`[HomePage] Successfully updated action item ID ${actionItemId}:`, updatedItem);
      // Update with server response to ensure consistency
      setActionItems(prev =>
        prev.map(item => (item.id === updatedItem.id ? updatedItem : item))
      );
    } catch (error) {
      console.error(`[HomePage] Error in handleUpdateActionItem catch block for ID ${actionItemId}:`, error);
      alert(`Error updating action item: ${error.message}`);
      setActionItems(originalActionItems); // Revert on error
    }
  };

  // Handler for deleting an action item
  const handleDeleteActionItem = async (actionItemId) => {
    console.log(`[HomePage] handleDeleteActionItem called for ID: ${actionItemId}`);
    if (!confirm("Are you sure you want to delete this action item?")) return;
    const originalActionItems = [...actionItems];
    setActionItems(prev => prev.filter(item => item.id !== actionItemId)); // Optimistic UI update
    try {
      const response = await fetch(`/api/action-items/${actionItemId}`, {
        method: 'DELETE',
      });
      console.log(`[HomePage] Delete action item API response status for ID ${actionItemId}:`, response.status);
      if (!response.ok && response.status !== 204) {
        const errorResult = await response.json().catch(() => ({error: `API error ${response.status}: ${response.statusText}`}));
        console.error(`[HomePage] Delete action item API error for ID ${actionItemId}:`, errorResult);
        throw new Error(errorResult.error || `Failed to delete action item: Status ${response.status}`);
      }
      console.log(`[HomePage] Successfully deleted action item ID ${actionItemId}`);
      // If successful, UI is already updated.
    } catch (error) {
      console.error(`[HomePage] Error in handleDeleteActionItem catch block for ID ${actionItemId}:`, error);
      alert(`Error deleting action item: ${error.message}`);
      setActionItems(originalActionItems); // Revert on error
    }
  };

  let pageTitle = "Curriculum Dashboard - Platform";
  if (selectedCurriculumDetails && selectedCurriculumDetails.name) {
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
        isLoading={isLoadingDetails}
        error={detailsError}
        onAnalysisComplete={handleAnalysisCompletion}
      />
      <AiChatInterface
        selectedCurriculum={selectedCurriculumDetails}
      />
    </MainLayout>
  );
}
