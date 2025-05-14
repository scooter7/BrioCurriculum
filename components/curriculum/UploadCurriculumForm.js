// File: components/curriculum/UploadCurriculumForm.js
import React, { useState, useEffect } from 'react';

const formStyle = { display: 'flex', flexDirection: 'column', gap: '16px' };
const formGroupStyle = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle = { fontWeight: '500', fontSize: '14px', color: 'var(--text-headings)' };
const fileInputInfoStyle = { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' };
const errorTextStyle = { color: 'red', fontSize: '13px', marginTop: '5px' };
const buttonGroupStyle = { marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' };

const UploadCurriculumForm = ({ onSubmit, onCancel, isLoading }) => {
  const [name, setName] = useState('');
  const [schoolTag, setSchoolTag] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileNameDisplay, setFileNameDisplay] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("[UploadCurriculumForm] File selected:", file, "Type:", typeof file, "Instance of File:", file instanceof File); // DEBUG
      setSelectedFile(file);
      setFileNameDisplay(file.name);
      setError('');
    } else {
      setSelectedFile(null);
      setFileNameDisplay('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Curriculum name is required.");
      return;
    }
    if (!selectedFile) {
      setError("Please select a curriculum file.");
      return;
    }
    setError('');

    const formData = new FormData();
    formData.append('name', name);
    formData.append('schoolTag', schoolTag);
    
    // Ensure selectedFile is indeed a File object before appending
    if (selectedFile instanceof File) {
        formData.append('curriculumFile', selectedFile, selectedFile.name); // Third argument is optional filename
    } else {
        console.error("[UploadCurriculumForm] selectedFile is not a File object:", selectedFile);
        setError("Invalid file selected. Please try again.");
        return;
    }


    console.log("[UploadCurriculumForm] Submitting FormData. FormData entries:");
    for (let [key, value] of formData.entries()) { // DEBUG FormData content
        console.log(`  ${key}:`, value);
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <p style={errorTextStyle}>{error}</p>}
      <div style={formGroupStyle}>
        <label htmlFor="curriculumName" style={labelStyle}>Curriculum Name:</label>
        <input
          type="text"
          id="curriculumName"
          name="name"
          className="input-field"
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
          name="schoolTag"
          className="input-field"
          value={schoolTag}
          onChange={(e) => setSchoolTag(e.target.value)}
          placeholder="e.g., Oakwood High School"
        />
      </div>
      <div style={formGroupStyle}>
        <label htmlFor="curriculumFile" style={labelStyle}>Curriculum File:</label>
        <input
          type="file"
          id="curriculumFile"
          name="curriculumFile" // This name must match what formidable expects
          className="input-field"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
          required
        />
        {fileNameDisplay && <p style={fileInputInfoStyle}>Selected file: {fileNameDisplay}</p>}
      </div>
      <div style={buttonGroupStyle}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Uploading...' : 'Upload Curriculum'}
        </button>
      </div>
    </form>
  );
};
export default UploadCurriculumForm;
