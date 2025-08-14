// Global variables
let currentDate = new Date();
let uploadedFiles = {}; // Will be loaded from server, organized by date
let allPhotosFlat = []; // Flat array of all photos for easier lookup
let selectedDate = null;
let currentSection = 'upload';
let filesToUpload = []; // Stores files selected for single upload
let filesToBulkUpload = []; // Stores files selected for bulk upload

// For editing
let currentlyEditingPhotoId = null;
let currentEditPhotoRotation = 0; // Stores the current rotation for the photo being edited

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

/**
 * Initializes the application
 */
async function init() {
    updateDateTime();
    await loadPhotosFromServer(); // Load existing photos from server
    renderCalendar();
    renderBlogGallery();
    renderGridGallery();
    updateJsonViewer();
    renderEditPhotoSelection(); // Populate the dropdown for editing

    // Set default date/time for upload form to current date/time
    const now = new Date();
    document.getElementById('photoDate').value = now.toISOString().split('T')[0];
    document.getElementById('photoTime').value = now.toTimeString().slice(0, 5);
    
    // Update datetime display every second
    setInterval(updateDateTime, 1000);

    // Apply dark mode preference if saved and update toggle icon
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').innerHTML = '🌙';
    } else {
        localStorage.setItem('darkMode', 'disabled'); // Ensure it's explicitly set for light mode
        document.getElementById('darkModeToggle').innerHTML = '☀️';
    }

    // Add event listeners to check for form validity for single upload button
    document.getElementById('photoTitle').addEventListener('input', checkSingleUploadFormValidity);
    document.getElementById('photoDate').addEventListener('input', checkSingleUploadFormValidity);
    document.getElementById('photoTime').addEventListener('input', checkSingleUploadFormValidity);
    // Add event listener for single file input
    document.getElementById('fileInput').addEventListener('change', checkSingleUploadFormValidity);

    // Add event listener for bulk file input
    document.getElementById('bulkFileInput').addEventListener('change', handleBulkFileSelect);
}

/**
 * Toggles the visibility of the navigation menu on small screens
 */
function toggleNavMenu() {
    const navButtons = document.querySelector('.nav-buttons');
    navButtons.classList.toggle('show');
}

/**
 * Checks if the single upload form is valid to enable the submit button
 */
function checkSingleUploadFormValidity() {
    const title = document.getElementById('photoTitle').value;
    const date = document.getElementById('photoDate').value;
    const time = document.getElementById('photoTime').value;
    const submitBtn = document.getElementById('submitSingleUploadBtn'); // Changed ID

    if (title.trim() !== '' && date.trim() !== '' && time.trim() !== '' && filesToUpload.length > 0) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

/**
 * Toggles dark mode on/off
 */
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('darkMode', 'enabled');
        darkModeToggle.innerHTML = '🌙';
    } else {
        localStorage.setItem('darkMode', 'disabled');
        darkModeToggle.innerHTML = '☀️';
    }
}

/**
 * Load photos from server and flatten them for easier access
 */
async function loadPhotosFromServer() {
    try {
        // Add a unique timestamp to the API URL to aggressively bust cache
        const timestamp = Date.now();
        const response = await fetch(`${window.location.origin}/api/photos?_=${timestamp}`);
        if (response.ok) {
            const data = await response.json();
            uploadedFiles = data.photos || {};
            allPhotosFlat = [];
            // Flatten the uploadedFiles object into an array
            Object.values(uploadedFiles).forEach(dateFiles => {
                allPhotosFlat = allPhotosFlat.concat(dateFiles);
            });
            console.log("Photos loaded from server:", uploadedFiles); // Debugging
        } else {
            console.log('No photos found on server or error occurred');
            uploadedFiles = {};
            allPhotosFlat = [];
        }
    } catch (error) {
        console.error('Error loading photos from server:', error);
        uploadedFiles = {};
        allPhotosFlat = [];
    }
}

/**
 * Refresh data from server
 */
async function refreshData() {
    showStatus('Refreshing data from server...', 'success');
    await loadPhotosFromServer();
    renderCalendar();
    renderBlogGallery();
    renderGridGallery();
    updateJsonViewer();
    renderEditPhotoSelection(); // Re-populate edit dropdown
    showStatus('Data refreshed successfully!', 'success');
}

/**
 * Shows the selected section and updates navigation button active state
 */
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Deactivate all navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find the button corresponding to the sectionId and activate it
    const targetButton = Array.from(document.querySelectorAll('.nav-btn')).find(btn => 
        btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${sectionId}'`)
    );
    if (targetButton) {
        targetButton.classList.add('active');
    }

    // Show the selected section
    document.getElementById(sectionId).classList.add('active');
    currentSection = sectionId;

    // Specific refresh for edit section when shown
    if (sectionId === 'edit-photos') {
        renderEditPhotoSelection();
    }
}

/**
 * Updates the current date and time display in the header
 */
function updateDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('datetime').textContent = now.toLocaleDateString('en-US', options);
}

/**
 * Handles file selection from the input element, stores files, and updates preview for SINGLE upload
 */
function handleFileSelect(event) {
    filesToUpload = Array.from(event.target.files);
    const fileListElement = document.getElementById('fileList');
    const selectedFilesPreview = document.getElementById('selectedFilesPreview');
    fileListElement.innerHTML = ''; // Clear previous list

    if (filesToUpload.length > 0) {
        selectedFilesPreview.style.display = 'block';
        filesToUpload.forEach(file => {
            const listItem = document.createElement('li');
            listItem.textContent = file.name;
            fileListElement.appendChild(listItem);
        });
    } else {
        selectedFilesPreview.style.display = 'none';
    }
    checkSingleUploadFormValidity(); // Check validity after file selection
}

/**
 * Handles drag over event for the upload area
 */
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover'); // Use currentTarget for the specific drag area
}

/**
 * Handles drag leave event for the upload area
 */
function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover'); // Use currentTarget for the specific drag area
}

/**
 * Handles drop event for the upload area (for single upload)
 */
function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    filesToUpload = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleFileSelect({ target: { files: filesToUpload } }); // Reuse handleFileSelect to update preview
}

/**
 * Processes and uploads selected image files to server for SINGLE upload
 */
async function uploadSinglePhoto() { // Renamed from uploadPost
    if (filesToUpload.length === 0) {
        showStatus('No image files selected for upload.', 'error', 'singleUploadStatusMessage'); // Updated ID
        return;
    }

    const title = document.getElementById('photoTitle').value;
    const date = document.getElementById('photoDate').value;
    const time = document.getElementById('photoTime').value;
    const location = document.getElementById('photoLocation').value;
    const description = document.getElementById('photoDescription').value;

    if (!title.trim() || !date || !time) {
        showStatus('Please fill in Photo Title, Date, and Time.', 'error', 'singleUploadStatusMessage'); // Updated ID
        return;
    }

    const uploadBtn = document.getElementById('submitSingleUploadBtn'); // Updated ID
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<span class="spinner"></span>Uploading...';
    uploadBtn.disabled = true;

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < filesToUpload.length; i++) {
        try {
            const file = filesToUpload[i];
            const formData = new FormData();
            
            formData.append('image', file);
            formData.append('name', title); // Pass the user-provided name
            formData.append('date', date);
            formData.append('time', time);
            formData.append('location', location);
            formData.append('description', description);

            const response = await fetch(`${window.location.origin}/api/upload_single`, { // Updated endpoint
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
                const errorData = await response.json();
                console.error('Single upload error:', errorData);
            }
        } catch (error) {
            errorCount++;
            console.error('Single upload network error:', error);
        }
    }

    // Reset upload button
    uploadBtn.innerHTML = originalText;
    uploadBtn.disabled = false;

    if (successCount > 0) {
        showStatus(`Successfully uploaded ${successCount} photo(s)!`, 'success', 'singleUploadStatusMessage'); // Updated ID
        
        // Clear form and selected files
        document.getElementById('photoTitle').value = '';
        document.getElementById('photoLocation').value = '';
        document.getElementById('photoDescription').value = '';
        document.getElementById('fileInput').value = '';
        filesToUpload = []; // Clear stored files
        document.getElementById('selectedFilesPreview').style.display = 'none';
        document.getElementById('fileList').innerHTML = '';
        checkSingleUploadFormValidity(); // Re-check to disable button

        // Refresh data from server and force a full page reload
        await loadPhotosFromServer();
        renderCalendar();
        renderBlogGallery();
        renderGridGallery();
        updateJsonViewer();
        renderEditPhotoSelection(); // Re-populate edit dropdown
        //location.reload(); // Force a full page reload
    }

    if (errorCount > 0) {
        showStatus(`${errorCount} file(s) failed to upload. ${successCount > 0 ? `${successCount} uploaded successfully.` : ''}`, 'error', 'singleUploadStatusMessage'); // Updated ID
    }
}

/**
 * Handles file selection for bulk upload
 */
function handleBulkFileSelect(event) {
    filesToBulkUpload = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));
    const fileListElement = document.getElementById('bulkFileList');
    const selectedFilesPreview = document.getElementById('bulkSelectedFilesPreview');
    const submitBtn = document.getElementById('submitBulkUploadBtn');
    fileListElement.innerHTML = '';
    
    if (filesToBulkUpload.length > 0) {
        selectedFilesPreview.style.display = 'block';
        filesToBulkUpload.forEach(file => {
            const listItem = document.createElement('li');
            listItem.textContent = file.name;
            fileListElement.appendChild(listItem);
        });
        submitBtn.disabled = false;
    } else {
        selectedFilesPreview.style.display = 'none';
        submitBtn.disabled = true;
    }
}

/**
 * Handles drop event for bulk upload area
 */
function handleBulkDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    filesToBulkUpload = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleBulkFileSelect({ target: { files: filesToBulkUpload } });
}

/**
 * Processes and uploads multiple files in a single request (for bulk upload)
 */
async function bulkUploadPhotos() {
    if (filesToBulkUpload.length === 0) {
        showStatus('No image files selected for bulk upload.', 'error', 'bulkStatusMessage');
        return;
    }

    const uploadBtn = document.getElementById('submitBulkUploadBtn');
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<span class="spinner"></span>Uploading...';
    uploadBtn.disabled = true;

    const formData = new FormData();
    filesToBulkUpload.forEach(file => {
        formData.append('images[]', file); // Use 'images[]' for multiple files
    });

    try {
        const response = await fetch(`${window.location.origin}/api/bulk_upload`, { // New endpoint
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            showStatus(data.message, 'success', 'bulkStatusMessage');
            
            // Clear file list
            filesToBulkUpload = [];
            document.getElementById('bulkFileInput').value = '';
            document.getElementById('bulkSelectedFilesPreview').style.display = 'none';
            document.getElementById('bulkFileList').innerHTML = '';
            document.getElementById('submitBulkUploadBtn').disabled = true; // Disable button

            // Refresh all views
            await loadPhotosFromServer();
            renderCalendar();
            renderBlogGallery();
            renderGridGallery();
            updateJsonViewer();
            renderEditPhotoSelection();
            //location.reload(); // Force a full page reload
        } else {
            const errorData = await response.json();
            showStatus('Error during bulk upload: ' + errorData.error, 'error', 'bulkStatusMessage');
        }
    } catch (error) {
        showStatus('Network error during bulk upload.', 'error', 'bulkStatusMessage');
    } finally {
        uploadBtn.innerHTML = originalText;
        uploadBtn.disabled = false; // Will be re-enabled by handleBulkFileSelect if files are selected
    }
}


/**
 * Displays a status message to the user
 */
function showStatus(message, type, targetElementId = 'statusMessage') {
    const statusDiv = document.getElementById(targetElementId);
    statusDiv.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
    setTimeout(() => {
        statusDiv.innerHTML = '';
    }, 4000);
}

/**
 * Downloads JSON data of all photos
 */
async function downloadJSON() { // Made async to ensure data is fresh
    showStatus('Preparing data for download...', 'success');
    await loadPhotosFromServer(); // Ensure latest data is fetched
    
    // Fetch raw metadata for export
    try {
        const response = await fetch(`${window.location.origin}/api/metadata`);
        if (!response.ok) {
            throw new Error('Failed to fetch raw metadata for download.');
        }
        const rawMetadata = await response.json();

        const dataStr = JSON.stringify({
            totalPhotos: Object.keys(rawMetadata).length,
            photos: rawMetadata // Export as a flat dictionary keyed by ID
        }, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `photo-blog-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showStatus('JSON data downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error downloading JSON:', error);
        showStatus('Error downloading JSON data.', 'error');
    }
}

/**
 * Renders the blog-style gallery section
 */
function renderBlogGallery() {
    const blogContainer = document.getElementById('blogGallery');
    blogContainer.innerHTML = '';
    
    let filesToShow = [];
    
    if (selectedDate && uploadedFiles[selectedDate]) {
        filesToShow = uploadedFiles[selectedDate];
    } else {
        filesToShow = [...allPhotosFlat]; // Use a copy
    }
    
    // Sort all files by photoDateTime in reverse chronological order (newest first)
    filesToShow.sort((a, b) => new Date(b.photoDateTime) - new Date(a.photoDateTime));
    
    if (filesToShow.length === 0) {
        blogContainer.innerHTML = '<div style="text-align: center; color: var(--medium-gray-text); font-style: italic; padding: 60px; font-size: 1.2rem;">📸 No photos uploaded yet.<br><br>Click "Upload & Create Post" to start your photo blog!</div>';
        return;
    }

    let lastDate = null; // To track date changes for subtle date headings

    filesToShow.forEach((file, fileIndex) => {
        const photoDateObj = new Date(file.photoDateTime);
        const currentDateKey = photoDateObj.toISOString().split('T')[0];

        // Add a subtle date heading if the date changes
        if (currentDateKey !== lastDate) {
            const dateHeading = document.createElement('h3');
            dateHeading.className = 'blog-date-heading';
            dateHeading.textContent = photoDateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            blogContainer.appendChild(dateHeading);
            lastDate = currentDateKey;
        }

        const blogEntry = document.createElement('div');
        blogEntry.className = 'blog-entry';
        
        const formattedTime = photoDateObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // --- Cache-busting: Use current timestamp for image URL to force reload ---
        const cacheBuster = Date.now(); 
        const imageUrl = `${window.location.origin}/photos/${file.fileName}?_=${cacheBuster}`;
        // --- End Cache-busting ---

        // Create the blog entry HTML
        let entryHTML = `
            <div class="blog-entry-header">
                <h3 class="blog-entry-title">${file.title}</h3>
                <div class="blog-entry-meta">
                    <span class="blog-entry-time">${formattedTime}</span>
                    ${file.location ? `<span> • </span><span class="blog-entry-location">${file.location}</span>` : ''}
                </div>
            `;
            
        // Add description if it exists (before image)
        if (file.description && file.description.trim()) {
            const descriptionParts = file.description.split('\n').filter(p => p.trim());
            if (descriptionParts.length > 0) {
                // Take first part of description before image
                entryHTML += `<div class="blog-description"><p>${descriptionParts[0].trim()}</p></div>`;
            }
        }

        // Add image (no rotation CSS needed since image is physically rotated)
        entryHTML += `
            <div class="blog-image-container">
                <img src="${imageUrl}" alt="${file.title}" class="blog-image" loading="lazy">
            </div>
        `;
        
        // Add remaining description parts after image
        if (file.description && file.description.trim()) {
            const descriptionParts = file.description.split('\n').filter(p => p.trim());
            if (descriptionParts.length > 1) {
                const remainingDescription = descriptionParts.slice(1).map(p => `<p>${p.trim()}</p>`).join('');
                entryHTML += `<div class="blog-description">${remainingDescription}</div>`;
            }
        }
        
        blogEntry.innerHTML = entryHTML;
        blogContainer.appendChild(blogEntry);
        
        // Add separator between blog entries (not between date headings)
        if (fileIndex < filesToShow.length - 1) {
            const nextFileDateKey = new Date(filesToShow[fileIndex + 1].photoDateTime).toISOString().split('T')[0];
            if (currentDateKey === nextFileDateKey) { // Only add separator if next file is on the same date
                const separator = document.createElement('hr');
                separator.className = 'blog-entry-separator';
                blogContainer.appendChild(separator);
            } else { // Add a more prominent separator if date changes
                const separator = document.createElement('hr');
                separator.className = 'blog-date-separator';
                blogContainer.appendChild(separator);
            }
        }
    });
}

/**
 * Renders the grid gallery section
 */
function renderGridGallery() {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';
    
    let filesToShow = [];
    
    if (selectedDate && uploadedFiles[selectedDate]) {
        filesToShow = uploadedFiles[selectedDate];
    } else {
        filesToShow = [...allPhotosFlat]; // Use a copy
    }
    
    filesToShow.sort((a, b) => new Date(b.photoDateTime) - new Date(a.photoDateTime));
    
    if (filesToShow.length === 0) {
        grid.innerHTML = '<div style="text-align: center; color: var(--medium-gray-text); font-style: italic; grid-column: 1/-1; padding: 60px; font-size: 1.2rem;">📸 No photos in gallery yet.<br><br>Upload some photos to see them here!</div>';
        return;
    }

    filesToShow.forEach(file => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        
        const photoDate = new Date(file.photoDateTime);
        const formattedDate = photoDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // --- Cache-busting: Use current timestamp for image URL to force reload ---
        const cacheBuster = Date.now(); 
        const imageUrl = `${window.location.origin}/photos/${file.fileName}?_=${cacheBuster}`;
        // --- End Cache-busting ---
        
        item.innerHTML = `
            <img src="${imageUrl}" alt="${file.title}" loading="lazy" onclick="openModal('${imageUrl}', '${file.title}', '${formattedDate}')">
            <div class="gallery-item-info">
                <!-- Removed name and date from here as requested -->
            </div>
            <button class="delete-gallery-item" onclick="deleteSinglePhoto('${file.id}', event)">×</button>
        `;
        
        grid.appendChild(item);
    });
    
    if (filesToShow.length === 0) {
        grid.innerHTML = '<div style="text-align: center; color: var(--medium-gray-text); font-style: italic; grid-column: 1/-1; padding: 60px; font-size: 1.2rem;">📸 No photos in gallery yet.<br><br>Upload some photos to see them here!</div>';
    }
}

/**
 * Opens the full-screen image modal
 */
function openModal(imageSrc, title, date) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalInfo = document.getElementById('modalInfo');
    
    modal.classList.add('active');
    // The imageSrc passed here already contains the cache-buster from renderGridGallery or renderBlogGallery
    modalImg.src = imageSrc; 
    modalInfo.innerHTML = `
        <div class="modal-title">${title}</div>
        <div class="modal-date">${date}</div>
    `;
    
    document.body.style.overflow = 'hidden';
}

/**
 * Closes the full-screen image modal
 */
function closeModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

/**
 * Renders the calendar view
 */
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();
    
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day;
        grid.appendChild(dayHeader);
    });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        grid.appendChild(emptyDay);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (uploadedFiles[dateKey] && uploadedFiles[dateKey].length > 0) {
            dayElement.classList.add('has-upload');
        }
        
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayElement.classList.add('today');
        }
        
        if (selectedDate === dateKey) {
            dayElement.classList.add('selected');
        }
        
        dayElement.onclick = () => selectDate(dateKey);
        grid.appendChild(dayElement);
    }
}

/**
 * Selects a date in the calendar
 */
function selectDate(dateKey) {
    selectedDate = (selectedDate === dateKey) ? null : dateKey;
    renderCalendar();
    renderBlogGallery();
    renderGridGallery();
}

/**
 * Navigate to previous month
 */
function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

/**
 * Navigate to next month
 */
function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

/**
 * Updates the JSON viewer
 */
async function updateJsonViewer() { // Made async to ensure data is fresh
    const viewer = document.getElementById('jsonViewer');
    // Fetch raw metadata for JSON viewer
    try {
        // Add a unique timestamp to the API URL to aggressively bust cache
        const timestamp = Date.now();
        const response = await fetch(`${window.location.origin}/api/metadata?_=${timestamp}`);
        if (!response.ok) {
            throw new Error('Failed to fetch raw metadata for JSON viewer.');
        }
        const rawMetadata = await response.json();

        const formattedData = {
            totalPhotos: Object.keys(rawMetadata).length,
            photos: rawMetadata // Display as a flat dictionary keyed by ID
        };
        
        viewer.textContent = JSON.stringify(formattedData, null, 2);
    } catch (error) {
        console.error('Error updating JSON viewer:', error);
        viewer.textContent = 'Error loading data.';
    }
}

/**
 * Populates the dropdown for selecting photos to edit
 */
function renderEditPhotoSelection() {
    const selectElement = document.getElementById('editPhotoSelect');
    selectElement.innerHTML = '<option value="">-- Select a photo --</option>'; // Reset dropdown

    // Sort photos by title for easier navigation
    const sortedPhotos = [...allPhotosFlat].sort((a, b) => a.title.localeCompare(b.title));

    sortedPhotos.forEach(photo => {
        const option = document.createElement('option');
        option.value = photo.id;
        option.textContent = `${photo.title} (${new Date(photo.photoDateTime).toLocaleDateString()})`;
        selectElement.appendChild(option);
    });

    // Hide edit form fields and preview initially
    document.getElementById('editFormFields').style.display = 'none';
    const editImagePreview = document.getElementById('editImagePreview');
    editImagePreview.style.display = 'none';
    editImagePreview.src = '';
    editImagePreview.style.transform = 'rotate(0deg)'; // Reset rotation
    currentlyEditingPhotoId = null;
    currentEditPhotoRotation = 0; // Reset rotation state
}

/**
 * Handles selection of a photo in the edit dropdown
 */
function onPhotoSelectedForEdit(event) {
    const photoId = event.target.value;
    const editFormFields = document.getElementById('editFormFields');
    const editImagePreview = document.getElementById('editImagePreview');

    if (!photoId) {
        editFormFields.style.display = 'none';
        editImagePreview.style.display = 'none';
        editImagePreview.src = '';
        editImagePreview.style.transform = 'rotate(0deg)'; // Reset rotation
        currentlyEditingPhotoId = null;
        currentEditPhotoRotation = 0; // Reset rotation state
        return;
    }

    const selectedPhoto = allPhotosFlat.find(photo => photo.id === photoId);

    if (selectedPhoto) {
        currentlyEditingPhotoId = photoId;
        document.getElementById('editPhotoTitle').value = selectedPhoto.title;
        
        // Format date and time for input fields
        const dateTime = new Date(selectedPhoto.photoDateTime);
        document.getElementById('editPhotoDate').value = dateTime.toISOString().split('T')[0];
        document.getElementById('editPhotoTime').value = dateTime.toTimeString().slice(0, 5);
        
        document.getElementById('editPhotoLocation').value = selectedPhoto.location || '';
        document.getElementById('editPhotoDescription').value = selectedPhoto.description || '';
        
        // --- Cache-busting: Use current timestamp for edit preview image ---
        const cacheBuster = Date.now(); 
        editImagePreview.src = `${window.location.origin}/photos/${selectedPhoto.fileName}?_=${cacheBuster}`;
        // --- End Cache-busting ---

        editImagePreview.style.display = 'block';
        editFormFields.style.display = 'grid'; // Display as grid

        // Reset rotation state since image is now physically correct
        currentEditPhotoRotation = 0;
        editImagePreview.style.transform = 'rotate(0deg)';
        console.log("Selected photo for edit:", selectedPhoto); // Debugging
    } else {
        editFormFields.style.display = 'none';
        editImagePreview.style.display = 'none';
        editImagePreview.src = '';
        editImagePreview.style.transform = 'rotate(0deg)'; // Reset rotation
        currentlyEditingPhotoId = null;
        currentEditPhotoRotation = 0; // Reset rotation state
        showStatus('Selected photo not found.', 'error', 'editStatusMessage');
    }
}

/**
 * Rotates the image preview by 90 degrees clockwise.
 */
function rotateImage() {
    if (!currentlyEditingPhotoId) {
        showStatus('Please select a photo to rotate.', 'error', 'editStatusMessage');
        return;
    }
    currentEditPhotoRotation = (currentEditPhotoRotation + 90) % 360;
    document.getElementById('editImagePreview').style.transform = `rotate(${currentEditPhotoRotation}deg)`;
    console.log("Current preview rotation:", currentEditPhotoRotation); // Debugging
}

/**
 * Saves the edited photo metadata
 */
async function saveEditedPhoto() {
    if (!currentlyEditingPhotoId) {
        showStatus('No photo selected for editing.', 'error', 'editStatusMessage');
        return;
    }

    const title = document.getElementById('editPhotoTitle').value;
    const date = document.getElementById('editPhotoDate').value;
    const time = document.getElementById('editPhotoTime').value;
    const location = document.getElementById('editPhotoLocation').value;
    const description = document.getElementById('editPhotoDescription').value;

    if (!title.trim() || !date || !time) {
        showStatus('Please fill in Photo Title, Date, and Time.', 'error', 'editStatusMessage');
        return;
    }

    const saveBtn = document.getElementById('saveEditBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner"></span>Saving...';
    saveBtn.disabled = true;

    try {
        const response = await fetch(`${window.location.origin}/api/update_metadata`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: currentlyEditingPhotoId,
                title: title,
                photoDateTime: `${date}T${time}:00`, // Reconstruct datetime
                location: location,
                description: description,
                rotation: currentEditPhotoRotation // Include rotation
            })
        });

        if (response.ok) {
            showStatus('Photo metadata updated successfully!', 'success', 'editStatusMessage');
            await loadPhotosFromServer(); // Reload all data
            renderCalendar();
            renderBlogGallery();
            renderGridGallery();
            updateJsonViewer();
            renderEditPhotoSelection(); // Re-populate dropdown and reset form
            //location.reload(); // Force a full page reload
        } else {
            const errorData = await response.json();
            showStatus('Error updating photo: ' + errorData.error, 'error', 'editStatusMessage');
        }
    } catch (error) {
        showStatus('Error updating photo: ' + error.message, 'error', 'editStatusMessage');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

/**
 * Deletes a single photo
 */
async function deleteSinglePhoto(photoId, event) {
    event.stopPropagation();
    const confirmDelete = await showCustomConfirm('Are you sure you want to delete this photo? This cannot be undone.');
    if (!confirmDelete) return;

    try {
        const response = await fetch(`${window.location.origin}/api/delete_photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: photoId })
        });

        if (response.ok) {
            // Remove from local state
            allPhotosFlat = allPhotosFlat.filter(photo => photo.id !== photoId);
            for (let dateKey in uploadedFiles) {
                uploadedFiles[dateKey] = uploadedFiles[dateKey].filter(photo => photo.id !== photoId);
                if (uploadedFiles[dateKey].length === 0) {
                    delete uploadedFiles[dateKey];
                }
            }

            // Re-render everything
            renderBlogGallery();
            renderGridGallery();
            renderCalendar();
            updateJsonViewer();
            renderEditPhotoSelection();

            showStatus('Photo deleted successfully!', 'success');
        } else {
            const errorData = await response.json();
            showStatus('Error deleting photo: ' + errorData.error, 'error');
        }
    } catch (error) {
        showStatus('Error deleting photo: ' + error.message, 'error');
    }
}


/**
 * Deletes all photos
 */
async function deleteAllPhotos() {
    const confirmDelete = await showCustomConfirm('Are you sure you want to permanently delete ALL photos? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
        const totalPhotos = allPhotosFlat.length;

        const response = await fetch(`${window.location.origin}/api/delete_all_photos`, {
            method: 'POST'
        });

        if (response.ok) {
            allPhotosFlat = [];
            uploadedFiles = {};
            renderBlogGallery();
            renderGridGallery();
            renderCalendar();
            updateJsonViewer();
            renderEditPhotoSelection();
            showStatus(`Successfully deleted ${totalPhotos} photos!`, 'success');
        } else {
            const errorData = await response.json();
            showStatus('Error deleting photos: ' + errorData.error, 'error');
        }
    } catch (error) {
        showStatus('Error deleting photos: ' + error.message, 'error');
    }
}


/**
 * Custom confirmation modal instead of alert/confirm
 */
function showCustomConfirm(message) {
    return new Promise(resolve => {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
            z-index: 9999;
        `;
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--card-bg); padding: 30px; border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); text-align: center; max-width: 400px;
            color: var(--text-color);
        `;
        const messageParagraph = document.createElement('p');
        messageParagraph.textContent = message;
        messageParagraph.style.cssText = 'margin-bottom: 25px; font-size: 1.1rem;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; gap: 15px;';

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Yes, Delete';
        confirmButton.style.cssText = `
            background: var(--primary-red); color: white; border: none; border-radius: 10px;
            padding: 12px 25px; cursor: pointer; font-weight: 600; font-size: 1rem;
            transition: all 0.2s ease; box-shadow: 0 4px 15px var(--shadow-button-red);
        `;
        confirmButton.onmouseover = () => confirmButton.style.transform = 'translateY(-2px)';
        confirmButton.onmouseout = () => confirmButton.style.transform = 'translateY(0)';
        confirmButton.onclick = () => {
            document.body.removeChild(modalOverlay);
            resolve(true);
        };

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            background: var(--medium-gray-text); color: white; border: none; border-radius: 10px;
            padding: 12px 25px; cursor: pointer; font-weight: 600; font-size: 1rem;
            transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        `;
        cancelButton.onmouseover = () => cancelButton.style.transform = 'translateY(-2px)';
        cancelButton.onmouseout = () => cancelButton.style.transform = 'translateY(0)';
        cancelButton.onclick = () => {
            document.body.removeChild(modalOverlay);
            resolve(false);
        };

        buttonContainer.appendChild(confirmButton);
        buttonContainer.appendChild(cancelButton);
        modalContent.appendChild(messageParagraph);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
    });
}

// Modal event listeners for image viewer
document.getElementById('imageModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});
