// File: components/shared/Modal.js
import React, { useEffect } from 'react';

const Modal = ({ isOpen, onClose, title, children }) => {
  // Effect to handle 'Escape' key press for closing the modal
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    // Cleanup function to remove the event listener when the component unmounts or isOpen changes
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  // If the modal is not open, don't render anything
  if (!isOpen) {
    return null;
  }

  // Stop click propagation for the modal content itself,
  // so clicking inside the modal doesn't close it.
  const handleModalContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div style={modalStyle} onClick={handleModalContentClick}>
        <div style={modalHeaderStyle}>
          {title && <h2 id="modal-title" style={modalTitleStyle}>{title}</h2>}
          <button onClick={onClose} style={closeButtonStyle} aria-label="Close modal">
            &times; {/* HTML entity for 'X' a.k.a. times symbol */}
          </button>
        </div>
        <div style={modalBodyStyle}>
          {children}
        </div>
        {/* Optional: Footer could be added here or passed as a prop */}
        {/* <div style={modalFooterStyle}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{marginLeft: '10px'}}>Submit</button>
        </div> */}
      </div>
    </div>
  );
};

// Inline Styles (Consider moving to CSS Modules or a dedicated styling solution)
const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent black backdrop
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1050, // Ensure modal is on top of other content
};

const modalStyle = {
  backgroundColor: '#FFFFFF',
  padding: '20px',
  borderRadius: 'var(--border-radius)', // Using CSS variable
  boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
  minWidth: '300px',
  maxWidth: '600px', // Max width for the modal
  width: '90%', // Responsive width
  maxHeight: '90vh', // Max height
  overflowY: 'auto', // Scroll if content overflows
  display: 'flex',
  flexDirection: 'column',
  position: 'relative', // For positioning the close button
};

const modalHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '10px',
  marginBottom: '15px',
};

const modalTitleStyle = {
  margin: 0,
  fontSize: '20px',
  fontWeight: '600',
  color: 'var(--text-headings)',
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '24px', // Larger 'X'
  fontWeight: 'bold',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '0 5px', // Minimal padding
  lineHeight: 1,
};

const modalBodyStyle = {
  // Styles for the main content area of the modal
  // flexGrow: 1, // If you want the body to take up available space
};

// const modalFooterStyle = { // Example if you add a fixed footer
//   borderTop: '1px solid var(--border-color)',
//   paddingTop: '15px',
//   marginTop: '20px',
//   display: 'flex',
//   justifyContent: 'flex-end',
// };

export default Modal;
