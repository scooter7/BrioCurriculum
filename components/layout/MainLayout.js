// File: components/layout/MainLayout.js
import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

const MainLayout = ({
  children,
  curricula,
  selectedCurriculumId,
  onSelectCurriculum,
  isLoadingCurricula,
  curriculaError,
  onCreateNewCurriculum,
  isCreatingCurriculum,
  onDeleteCurriculum,     // New prop
  isDeletingCurriculum,   // New prop
  actionItems,
  isLoadingActionItems,
  actionItemsError,
  onCreateActionItem,
  onUpdateActionItem,
  onDeleteActionItem
}) => {
  return (
    <div style={platformContainerStyle}>
      <Header />
      <div style={mainLayoutStyle}>
        <Sidebar
          curricula={curricula}
          selectedCurriculumId={selectedCurriculumId}
          onSelectCurriculum={onSelectCurriculum}
          isLoadingCurricula={isLoadingCurricula}
          curriculaError={curriculaError}
          onCreateNewCurriculum={onCreateNewCurriculum}
          isCreatingCurriculum={isCreatingCurriculum}
          onDeleteCurriculum={onDeleteCurriculum} // Pass down
          isDeletingCurriculum={isDeletingCurriculum} // Pass down
          actionItems={actionItems}
          isLoadingActionItems={isLoadingActionItems}
          actionItemsError={actionItemsError}
          onCreateActionItem={onCreateActionItem}
          onUpdateActionItem={onUpdateActionItem}
          onDeleteActionItem={onDeleteActionItem}
        />
        <main style={mainContentAreaStyle}>
          {children}
        </main>
      </div>
    </div>
  );
};

// Styles (ensure these are complete as in the previous version)
const platformContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
};
const mainLayoutStyle = {
  display: 'flex',
  flexGrow: 1,
  overflow: 'hidden',
};
const mainContentAreaStyle = {
  flexGrow: 1,
  backgroundColor: 'var(--bg-light)',
  padding: '24px 32px',
  overflowY: 'auto',
};

export default MainLayout;
