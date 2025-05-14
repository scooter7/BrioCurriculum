// File: components/layout/Sidebar.js
import React, { useState } from 'react';
import Modal from '../shared/Modal'; // Ensure path is correct
import UploadCurriculumForm from '../curriculum/UploadCurriculumForm'; // Ensure path is correct
import ActionItemForm from '../actionitems/ActionItemForm'; // Ensure path is correct

const Sidebar = ({
  curricula = [],
  selectedCurriculumId,
  onSelectCurriculum,
  isLoadingCurricula,
  curriculaError,
  onCreateNewCurriculum,
  isCreatingCurriculum,
  onDeleteCurriculum,
  isDeletingCurriculum,
  actionItems = [],
  isLoadingActionItems,
  actionItemsError,
  onCreateActionItem,
  onUpdateActionItem,
  onDeleteActionItem
}) => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isActionItemModalOpen, setIsActionItemModalOpen] = useState(false);
  const [editingActionItem, setEditingActionItem] = useState(null);
  const [isSubmittingActionItem, setIsSubmittingActionItem] = useState(false);
  const [deletingCurriculumId, setDeletingCurriculumId] = useState(null);

  const openUploadModal = () => setIsUploadModalOpen(true);
  const closeUploadModal = () => setIsUploadModalOpen(false);

  const handleUploadFormSubmit = async (formData) => {
    if (onCreateNewCurriculum) {
      await onCreateNewCurriculum(formData);
    }
    closeUploadModal();
  };

  const openCreateActionItemModal = () => {
    setEditingActionItem(null);
    setIsActionItemModalOpen(true);
  };

  const openEditActionItemModal = (item) => {
    setEditingActionItem(item);
    setIsActionItemModalOpen(true);
  };

  const closeActionItemModal = () => {
    setIsActionItemModalOpen(false);
    setEditingActionItem(null);
  };

  const handleActionItemFormSubmit = async (formData) => {
    setIsSubmittingActionItem(true);
    try {
      if (editingActionItem && editingActionItem.id) {
        if (onUpdateActionItem) {
          await onUpdateActionItem(editingActionItem.id, formData);
        }
      } else {
        if (onCreateActionItem) {
          await onCreateActionItem(formData);
        }
      }
      closeActionItemModal();
    } catch (error) {
      console.error("Error submitting action item form from Sidebar:", error);
      // Optionally, set an error state to display in the modal
    } finally {
      setIsSubmittingActionItem(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Completed':
        return { color: 'var(--success-green)', fontWeight: 'bold' };
      case 'In Progress':
        return { color: 'var(--secondary-accent-color)', fontWeight: '500' };
      case 'Not Started':
      default:
        return { color: 'var(--text-secondary)' };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Ensure dateString is valid before attempting to format
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const handleDeleteCurriculumClick = async (curriculumId) => {
    setDeletingCurriculumId(curriculumId);
    if (onDeleteCurriculum) {
        await onDeleteCurriculum(curriculumId);
    }
    setDeletingCurriculumId(null); 
  };

  return (
    <>
      <aside style={sidebarStyle}>
        <div style={sidebarSectionStyle}>
          <h2 style={sidebarHeaderStyle}>My Curricula</h2>
          {isLoadingCurricula && <p style={loadingTextStyle}>Loading curricula list...</p>}
          {curriculaError && <p style={errorTextStyle}>Error: {curriculaError}</p>}
          {!isLoadingCurricula && !curriculaError && (
            <ul style={listStyle}>
              {curricula.length === 0 && (
                <li style={emptyListStyle}>No curricula found.</li>
              )}
              {curricula.map((item) => (
                <li
                  key={item.id}
                  style={{
                    ...curriculumItemStyle,
                    ...(selectedCurriculumId === item.id ? selectedCurriculumItemStyle : {}),
                  }}
                >
                  <div style={curriculumItemContentWrapperStyle} onClick={() => onSelectCurriculum(item.id)} title={`Select ${item.name}`}>
                    <span style={iconStyle}>📄</span>
                    <div style={itemDetailsStyle}>
                      <span style={itemNameStyle} className={selectedCurriculumId === item.id ? 'selected-item-name' : ''}>{item.name}</span>
                      {item.schoolTag && <span style={itemTagStyle} className={selectedCurriculumId === item.id ? 'selected-item-tag' : ''}>{item.schoolTag}</span>}
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                        e.stopPropagation(); 
                        handleDeleteCurriculumClick(item.id);
                    }}
                    style={curriculumDeleteButtonStyle}
                    disabled={isDeletingCurriculum && deletingCurriculumId === item.id}
                    title="Delete Curriculum"
                    aria-label={`Delete curriculum ${item.name}`}
                    className="curriculum-delete-btn" // For potential CSS hover effects
                  >
                    {(isDeletingCurriculum && deletingCurriculumId === item.id) ? '...' : '🗑️'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              marginTop: (curricula.length === 0 && !isLoadingCurricula && !curriculaError) || isLoadingCurricula || curriculaError ? '10px' : '0px'
            }}
            onClick={openUploadModal}
            disabled={isCreatingCurriculum}
          >
            <span className="icon">+</span>
            {isCreatingCurriculum ? 'Processing...' : 'Upload New Curriculum'}
          </button>
        </div>

        <div style={sidebarSectionStyle}>
          <h2 style={sidebarHeaderStyle}>My Action Items</h2>
          {isLoadingActionItems && <p style={loadingTextStyle}>Loading action items...</p>}
          {actionItemsError && <p style={errorTextStyle}>Error: {actionItemsError}</p>}
          
          {!isLoadingActionItems && !actionItemsError && selectedCurriculumId && (
            <ul style={listStyle}>
              {actionItems.length === 0 && (
                <li style={emptyListStyle}>No action items for this curriculum.</li>
              )}
              {actionItems.map((item) => (
                <li key={item.id} style={actionItemListItemStyle}>
                  <div style={actionItemContentStyle}>
                    <span 
                        style={{...actionTitleStyle, textDecoration: item.status === 'Completed' ? 'line-through' : 'none'}}
                        onClick={() => openEditActionItemModal(item)}
                        title={`Edit: ${item.title}`}
                    >
                        {item.title}
                    </span>
                    <div style={actionItemMetaStyle}>
                        <span style={{...actionItemStatusStyle, ...getStatusStyle(item.status)}}>
                            {item.status}
                        </span>
                        {(item.startDate || item.endDate) && (
                            <span style={actionItemDateRangeStyle}>
                                {formatDate(item.startDate)} - {formatDate(item.endDate)}
                            </span>
                        )}
                    </div>
                  </div>
                  <div style={actionItemActionsStyle}>
                    <button 
                        onClick={() => openEditActionItemModal(item)} 
                        style={editButtonStyle}
                        aria-label="Edit action item"
                        title="Edit"
                        className="action-item-edit-btn" // For potential CSS hover effects
                    >
                        ✏️
                    </button>
                    {onDeleteActionItem && (
                        <button 
                            onClick={() => onDeleteActionItem(item.id)} 
                            style={deleteButtonStyle}
                            aria-label="Delete action item"
                            title="Delete"
                            className="action-item-delete-btn" // For potential CSS hover effects
                        >
                            &times;
                        </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!selectedCurriculumId && !isLoadingActionItems && !actionItemsError && (
            <p style={emptyListStyle}>Select a curriculum to see or add action items.</p>
          )}
          {selectedCurriculumId && (
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '10px' }}
              onClick={openCreateActionItemModal}
              disabled={isSubmittingActionItem}
            >
              Add New Action Item <span className="icon" style={{marginLeft: '5px'}}>+</span>
            </button>
          )}
        </div>
      </aside>

      <Modal isOpen={isUploadModalOpen} onClose={closeUploadModal} title="Upload New Curriculum">
        <UploadCurriculumForm
          onSubmit={handleUploadFormSubmit}
          onCancel={closeUploadModal}
          isLoading={isCreatingCurriculum}
        />
      </Modal>

      <Modal 
        isOpen={isActionItemModalOpen} 
        onClose={closeActionItemModal} 
        title={editingActionItem ? "Edit Action Item" : "Add New Action Item"}
      >
        <ActionItemForm
          onSubmit={handleActionItemFormSubmit}
          onCancel={closeActionItemModal}
          isLoading={isSubmittingActionItem}
          initialData={editingActionItem || {}}
        />
      </Modal>
    </>
  );
};

const sidebarStyle = {
  width: 'var(--sidebar-width)',
  backgroundColor: 'var(--bg-sidebar)',
  borderRight: '1px solid var(--border-color)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflowY: 'auto',
  flexShrink: 0,
  height: 'calc(100vh - var(--header-height))'
};
const sidebarSectionStyle = {
  display: 'flex',
  flexDirection: 'column'
};
const sidebarHeaderStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: 'var(--primary-color)',
  marginBottom: '12px'
};
const listStyle = {
  listStyle: 'none',
  padding: 0,
  margin: '0 0 16px 0'
};
const curriculumItemStyle = {
  padding: '10px 0px',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '14px',
  borderRadius: 'var(--border-radius)',
  marginBottom: '4px',
  position: 'relative',
  transition: 'background-color 0.2s ease'
};
const curriculumItemContentWrapperStyle = {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    cursor: 'pointer',
    paddingRight: '10px', // Space before delete button
    // To apply selected styles to text inside this wrapper, use classes
    // or pass selected state down to children if needed for more complex styling.
};
const selectedCurriculumItemStyle = {
  backgroundColor: '#E3F2FD',
  // Note: direct text color/fontWeight on the <li> won't apply to children spans by default
  // unless they inherit or are styled directly.
  // Adding classes 'selected-item-name' and 'selected-item-tag' to children for this.
};
const iconStyle = {
  marginRight: '8px',
  display: 'inline-block',
  flexShrink: 0
};
const itemDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexGrow: 1
};
const itemNameStyle = {
  fontSize: '15px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // color: 'inherit' // To inherit color from selected li
};
const itemTagStyle = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // color: 'inherit' // To inherit color from selected li
};
const actionItemListItemStyle = {
  padding: '10px 6px',
  fontSize: '14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '8px',
  borderBottom: '1px dashed var(--border-color)',
  cursor: 'default',
};
const actionItemContentStyle = {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    marginRight: '8px',
    overflow: 'hidden',
};
const actionTitleStyle = { 
    fontWeight: '500', 
    color: 'var(--text-primary)', 
    cursor: 'pointer',
    marginBottom: '4px',
    lineHeight: '1.3',
};
const actionItemMetaStyle = {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    fontSize: '12px',
    flexWrap: 'wrap',
};
const actionItemStatusStyle = {
    padding: '2px 6px',
    borderRadius: 'var(--border-radius)',
    fontSize: '11px',
    border: '1px solid transparent', // For consistent sizing if background changes
    whiteSpace: 'nowrap',
};
const actionItemDateRangeStyle = {
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
};
const actionItemActionsStyle = {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
};
const editButtonStyle = {
    background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px',
};
const deleteButtonStyle = {
    background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px', padding: '0 5px', lineHeight: 1,
};
const curriculumDeleteButtonStyle = {
    background: 'none',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '18px', 
    padding: '0 8px',
    marginLeft: '8px',
    flexShrink: 0,
    lineHeight: 1,
    borderRadius: 'var(--border-radius)',
    transition: 'color 0.2s ease, background-color 0.2s ease',
};
const loadingTextStyle = { 
    padding: '10px', 
    color: 'var(--text-secondary)', 
    textAlign: 'center'
};
const errorTextStyle = { 
    padding: '10px', 
    color: 'red', 
    textAlign: 'center', 
    border: '1px solid red', 
    borderRadius: 'var(--border-radius)', 
    backgroundColor: '#ffe0e0'
};
const emptyListStyle = { 
    padding: '10px', 
    color: 'var(--text-secondary)', 
    textAlign: 'center', 
    fontStyle: 'italic'
};

export default Sidebar;
