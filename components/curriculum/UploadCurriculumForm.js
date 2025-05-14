// File: components/curriculum/UploadCurriculumForm.js
import React, { useState } from 'react';

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px', // Space between form elements
};

const formGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const labelStyle = {
  marginBottom: '5px',
  fontSize: '14px',
  fontWeight: '500',
  color: 'var(--text-headings)',
};

// inputStyle will use the global .input-field class, but we can add specifics if needed
// const inputStyle = { ... };

const fileInputInfoStyle = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  marginTop: '5px',
};

const errorTextStyle = {
  color: 'red',
  fontSize: '13px',
  marginTop: '5px',
};

const buttonGroupStyle = {
  marginTop: '10px',
  display: 'flex',
  justifyContent: 'flex-end', // Align buttons to the right
  gap: '10px',
};

const UploadCurriculumForm = ({ onSubmit, onCancel, isLoading }) => {
  const [name, setName] = useState('');
  const [schoolTag, setSchoolTag] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState(''); // To display the selected file name
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setError(''); // Clear previous errors
    } else {
      setSelectedFile(null);
      setFileName('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault(); // Prevent default form submission
    if (!name.trim()) {
      setError("Curriculum name is required.");
      return;
    }
    if (!selectedFile) {
      setError("Please select a curriculum file.");
      return;
    }
    setError('');

    // Pass the form data to the onSubmit handler from props
    // In a real scenario, you'd handle the actual file object (selectedFile)
    // For now, we're just passing its name as originalFileName.
    onSubmit({
      name,
      schoolTag,
      originalFileName: fileName, // Using the selected file's name
      // file: selectedFile, // The actual file object if needed for direct upload handling
    });
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <p style={errorTextStyle}>{error}</p>}

      <div style={formGroupStyle}>
        <label htmlFor="curriculumName" style={labelStyle}>Curriculum Name:</label>
        <input
          type="text"
          id="curriculumName"
          className="input-field" // Using global style
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Oakwood High English 9 Curriculum"
          required
        />
      </div>

      <div style={formGroupStyle}>
        <label htmlFor="schoolTag" style={labelStyle}>School/District Tag (Optional):</label>
        <input
          type="text"
          id="schoolTag"
          className="input-field"
          value={schoolTag}
          onChange={(e) => setSchoolTag(e.target.value)}
          placeholder="e.g., Oakwood High School"
        />
      </div>

      <div style={formGroupStyle}>
        <label htmlFor="curriculumFile" style={labelStyle}>Curriculum File:</label>
        {/* Basic file input. Styling file inputs is notoriously tricky across browsers.
            For a more polished look, custom file input components are often used. */}
        <input
          type="file"
          id="curriculumFile"
          className="input-field" // May need specific styling for file inputs
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" // Example accepted file types
          required
        />
        {fileName && <p style={fileInputInfoStyle}>Selected file: {fileName}</p>}
        <p style={fileInputInfoStyle}>
          Note: Actual file content upload is not implemented in this prototype.
          We will use the file name for record creation.
        </p>
      </div>

      <div style={buttonGroupStyle}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Submitting...' : 'Submit Curriculum'}
        </button>
      </div>
    </form>
  );
};

export default UploadCurriculumForm;
